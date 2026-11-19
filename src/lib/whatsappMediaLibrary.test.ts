import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown>; receiver: unknown }>,
    rpcResult: { data: "00000000-0000-0000-0000-0000000000aa", error: null as null | { message: string } },
    removed: [] as string[][],
    uploaded: [] as string[],
    tableUpdates: 0,
    row: { id: "00000000-0000-0000-0000-0000000000aa", title: "Spring Catalogue" } as unknown,
  };
  const client = {
    marker: "the-client",
    rpc(this: { marker?: string } | undefined, fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args, receiver: this?.marker });
      return Promise.resolve(state.rpcResult);
    },
    storage: {
      from: () => ({
        upload: (path: string) => {
          state.uploaded.push(path);
          return Promise.resolve({ error: null });
        },
        remove: (paths: string[]) => {
          state.removed.push(paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
    from: () => ({
      update: () => {
        state.tableUpdates += 1;
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.row, error: null }) }) }),
    }),
  };
  return { state, client };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.client }));

import { removeUnsentStagingObject, uploadAndRegisterLibraryMedia } from "./whatsappMedia";

const pdf = () => new File([new Uint8Array(2048)], "Spring Catalogue.pdf", { type: "application/pdf" });

beforeEach(() => {
  h.state.rpcCalls.length = 0;
  h.state.removed.length = 0;
  h.state.uploaded.length = 0;
  h.state.tableUpdates = 0;
  h.state.rpcResult = { data: "00000000-0000-0000-0000-0000000000aa", error: null };
});

describe("library upload", () => {
  it("registers the item and its description in one RPC and never updates the table directly", async () => {
    const row = await uploadAndRegisterLibraryMedia({
      file: pdf(),
      title: "  Spring Catalogue ",
      description: "  Latest range ",
      category: "catalogue",
    });
    expect(h.state.rpcCalls).toHaveLength(1);
    const call = h.state.rpcCalls[0];
    expect(call.fn).toBe("wa_library_register");
    expect(call.receiver).toBe("the-client");
    expect(call.args).toMatchObject({
      p_title: "Spring Catalogue",
      p_kind: "catalogue",
      p_mime: "application/pdf",
      p_size_bytes: 2048,
      p_description: "Latest range",
    });
    expect(String(call.args.p_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(call.args.p_path)).toMatch(/^whatsapp-library\/catalogue\/\d+-[0-9a-f]{8}-Spring-Catalogue\.pdf$/);
    expect(h.state.tableUpdates).toBe(0);
    expect(h.state.removed).toHaveLength(0);
    expect(row).toEqual(h.state.row);
  });

  it("sends a null description when none is given", async () => {
    await uploadAndRegisterLibraryMedia({ file: pdf(), title: "Plain", category: "catalogue" });
    expect(h.state.rpcCalls[0].args.p_description).toBeNull();
  });

  it("removes only the uploaded object and reports the database message when registration fails", async () => {
    h.state.rpcResult = { data: null, error: { message: "QUOTA_EXCEEDED: Library quota of 350 MB exceeded" } };
    await expect(uploadAndRegisterLibraryMedia({ file: pdf(), title: "Too big", category: "catalogue" })).rejects.toThrow("QUOTA_EXCEEDED");
    expect(h.state.removed).toHaveLength(1);
    expect(h.state.removed[0]).toEqual([h.state.uploaded[0]]);
    expect(h.state.tableUpdates).toBe(0);
  });
});

describe("removeUnsentStagingObject", () => {
  const user = "11111111-1111-1111-1111-111111111111";

  it("removes a path inside the caller's own staging folder through the Storage API", async () => {
    await expect(removeUnsentStagingObject("whatsapp-staging/" + user + "/1-abc-quote.pdf", user)).resolves.toBe(true);
    expect(h.state.removed).toEqual([["whatsapp-staging/" + user + "/1-abc-quote.pdf"]]);
  });

  it("refuses other folders, traversal sequences and a missing user id", async () => {
    await expect(removeUnsentStagingObject("whatsapp-staging/22222222-2222-2222-2222-222222222222/x.pdf", user)).resolves.toBe(false);
    await expect(removeUnsentStagingObject("whatsapp-library/catalogue/x.pdf", user)).resolves.toBe(false);
    await expect(removeUnsentStagingObject("whatsapp-staging/" + user + "/../other/x.pdf", user)).resolves.toBe(false);
    await expect(removeUnsentStagingObject("whatsapp-staging/" + user + "//x.pdf", user)).resolves.toBe(false);
    await expect(removeUnsentStagingObject("whatsapp-staging//x.pdf", "")).resolves.toBe(false);
    expect(h.state.removed).toHaveLength(0);
  });
});
