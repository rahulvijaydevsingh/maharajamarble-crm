// Run with: deno test supabase/functions/customer-attachments/
//
// These tests run the REAL handler against an in-memory fake of the database, storage and user logins.
// They check permissions, encryption, tampering, key rotation, the lead import and the securing of old
// customer files. No network and no real key is used; every key is generated inside the test run.
import { handleRequest, type Deps } from "./handler.ts";
import { toBase64 } from "./crypto.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
function assertEquals<T>(actual: T, expected: T, message = "values differ") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

// Everything the handler prints with console.error is collected, so tests can check it leaks nothing.
const consoleErrors: string[] = [];
console.error = (...args: unknown[]) => {
  consoleErrors.push(args.map(String).join(" "));
};

// ---------------------------------------------------------------------------------------------
// Fake backend
// ---------------------------------------------------------------------------------------------

class FakeBackend {
  tables: Record<string, Row[]> = {
    customers: [],
    leads: [],
    profiles: [],
    entity_attachments: [],
    customer_secure_attachments: [],
    customer_attachment_access_log: [],
  };
  buckets = new Map<string, Map<string, Uint8Array>>();
  clock = 0;
  failRemoveInBucket: string | null = null;
  corruptDownloadsInBucket: string | null = null;
  downloadErrorMessage: string | null = null;

  bucket(name: string): Map<string, Uint8Array> {
    if (!this.buckets.has(name)) this.buckets.set(name, new Map());
    return this.buckets.get(name)!;
  }
  nowIso(): string {
    return new Date(Date.UTC(2026, 9, 7, 10, 0, this.clock++)).toISOString();
  }
  violatesUnique(table: string, row: Row): boolean {
    if (table !== "customer_secure_attachments") return false;
    return this.tables[table].some((r) =>
      r.id === row.id || r.storage_path === row.storage_path ||
      (row.source_lead_attachment_id && r.customer_id === row.customer_id &&
        r.source_lead_attachment_id === row.source_lead_attachment_id)
    );
  }
}

interface FakeUser {
  id: string;
  admin: boolean;
  manager: boolean;
  customers: Set<string>;
  leads: Set<string>;
}

class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  constructor(private be: FakeBackend, private table: string, private user: FakeUser | null, private rls: boolean) {}

  select(_columns?: string) { return this; }
  eq(column: string, value: unknown) { this.filters.push((r) => r[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => r[column] !== value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) this.filters.push((r) => r[column] !== null && r[column] !== undefined);
    return this;
  }
  insert(payload: Row | Row[]) { this.mode = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.mode = "update"; this.payload = payload; return this; }
  delete() { this.mode = "delete"; return this; }
  maybeSingle() { return this.exec(true); }
  // deno-lint-ignore no-explicit-any
  then(onFulfilled: any, onRejected: any) { return this.exec(false).then(onFulfilled, onRejected); }

  private visible(r: Row): boolean {
    if (!this.rls) return true;
    if (this.table === "customers") return !!this.user?.customers.has(r.id);
    if (this.table === "leads") return !!this.user?.leads.has(r.id);
    return false;
  }

  // deno-lint-ignore no-explicit-any
  private async exec(single: boolean): Promise<{ data: any; error: any }> {
    const rows = this.be.tables[this.table];
    if (this.mode === "select") {
      const found = rows.filter((r) => this.visible(r) && this.filters.every((f) => f(r))).map((r) => ({ ...r }));
      if (single) {
        if (found.length > 1) return { data: null, error: { message: "more than one row" } };
        return { data: found[0] ?? null, error: null };
      }
      return { data: found, error: null };
    }
    if (this.mode === "insert") {
      for (const item of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const row = { created_at: this.be.nowIso(), updated_at: this.be.nowIso(), ...item };
        if (this.be.violatesUnique(this.table, row)) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        rows.push(row);
      }
      return { data: null, error: null };
    }
    if (this.mode === "update") {
      for (const r of rows) if (this.filters.every((f) => f(r))) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    const keep = rows.filter((r) => !this.filters.every((f) => f(r)));
    rows.length = 0;
    rows.push(...keep);
    return { data: null, error: null };
  }
}

function makeClient(be: FakeBackend, user: FakeUser | null, rls: boolean) {
  return {
    auth: {
      getUser: async () =>
        user
          ? { data: { user: { id: user.id } }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    rpc: async (name: string) => {
      if (!user) return { data: null, error: { message: "no user" } };
      if (name === "is_admin") return { data: user.admin, error: null };
      if (name === "can_manage_customer_attachments") return { data: user.admin || user.manager, error: null };
      return { data: null, error: { message: "unknown function" } };
    },
    from: (table: string) => new Query(be, table, user, rls),
    storage: {
      from: (bucketName: string) => ({
        upload: async (path: string, data: Uint8Array, options?: { upsert?: boolean }) => {
          const bucket = be.bucket(bucketName);
          if (bucket.has(path) && !options?.upsert) {
            return { data: null, error: { message: "The resource already exists" } };
          }
          bucket.set(path, new Uint8Array(data));
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          if (be.downloadErrorMessage) return { data: null, error: { message: be.downloadErrorMessage } };
          const bytes = be.bucket(bucketName).get(path);
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          const out = new Uint8Array(bytes);
          if (be.corruptDownloadsInBucket === bucketName) out[out.length - 1] ^= 0xff;
          return { data: new Blob([out]), error: null };
        },
        remove: async (paths: string[]) => {
          if (be.failRemoveInBucket === bucketName) return { data: null, error: { message: "remove failed" } };
          for (const p of paths) be.bucket(bucketName).delete(p);
          return { data: paths, error: null };
        },
      }),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------------------------

const CUSTOMER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CUSTOMER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const URL = "https://example.test/functions/v1/customer-attachments";

const text = (s: string) => new TextEncoder().encode(s);
const pdf = (marker: string) => text("%PDF-1.7\n" + marker);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const exe = () => Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3]);
const asString = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const randomKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));

function setup() {
  const be = new FakeBackend();
  const users = new Map<string, FakeUser>();
  const kekEnv: { keys: Record<string, string>; current: string } = { keys: { "1": randomKey() }, current: "1" };
  let counter = 0;
  const deps: Deps = {
    createUserClient: (req) => {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").replace(/^tok-/, "");
      return makeClient(be, users.get(token) ?? null, true);
    },
    createAdminClient: () => makeClient(be, null, false),
    getEnv: (name) =>
      name === "CUSTOMER_ATTACHMENTS_KEKS"
        ? JSON.stringify(kekEnv.keys)
        : name === "CUSTOMER_ATTACHMENTS_KEK_CURRENT"
        ? kekEnv.current
        : undefined,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  };
  const user = (id: string, flags: Partial<Omit<FakeUser, "id">> = {}) => {
    users.set(id, {
      id,
      admin: false,
      manager: false,
      customers: new Set(),
      leads: new Set(),
      ...flags,
    });
    be.tables.profiles.push({ id, full_name: `Name of ${id}` });
  };
  return { be, deps, kekEnv, user };
}

function jsonRequest(token: string | null, body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer tok-${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
}
function uploadRequest(token: string | null, customerId: string | null, file: File | null) {
  const form = new FormData();
  form.set("action", "upload");
  if (customerId) form.set("customer_id", customerId);
  if (file) form.set("file", file);
  return new Request(URL, { method: "POST", headers: token ? { Authorization: `Bearer tok-${token}` } : {}, body: form });
}
const file = (bytes: Uint8Array, name: string, type = "application/octet-stream") =>
  new File([bytes as BlobPart], name, { type });

// Uploads a file as `uploader` and returns the new attachment id.
async function uploadAs(t: ReturnType<typeof setup>, uploader: string, bytes: Uint8Array, name = "doc.pdf") {
  const res = await handleRequest(uploadRequest(uploader, CUSTOMER, file(bytes, name)), t.deps);
  assertEquals(res.status, 200, "upload should succeed");
  return (await res.json()).id as string;
}

function standardWorld() {
  const t = setup();
  t.be.tables.customers.push({ id: CUSTOMER }, { id: OTHER_CUSTOMER });
  t.user("employee", { customers: new Set([CUSTOMER]) });
  t.user("outsider", {}); // can read nothing
  t.user("manager", { manager: true, customers: new Set([CUSTOMER]) });
  t.user("admin", { admin: true, customers: new Set([CUSTOMER, OTHER_CUSTOMER]), leads: new Set([LEAD]) });
  return t;
}

// ---------------------------------------------------------------------------------------------
// Authentication and request checks
// ---------------------------------------------------------------------------------------------

Deno.test("requests without a valid login are refused (401); OPTIONS and wrong methods are handled", async () => {
  const t = standardWorld();
  assertEquals((await handleRequest(jsonRequest(null, { action: "list", customer_id: CUSTOMER }), t.deps)).status, 401);
  assertEquals((await handleRequest(jsonRequest("nobody", { action: "list", customer_id: CUSTOMER }), t.deps)).status, 401);
  const options = await handleRequest(new Request(URL, { method: "OPTIONS" }), t.deps);
  assertEquals(options.status, 200);
  assert(options.headers.get("Access-Control-Allow-Origin") === "*", "OPTIONS must carry CORS headers");
  assertEquals((await handleRequest(new Request(URL, { method: "GET", headers: { Authorization: "Bearer tok-admin" } }), t.deps)).status, 400);
});

Deno.test("bad requests are refused (400) and oversized requests early (413)", async () => {
  const t = standardWorld();
  for (const body of [{ action: "nope" }, { action: "list" }, { action: "list", customer_id: "not-a-uuid" }, { foo: 1 }]) {
    assertEquals((await handleRequest(jsonRequest("admin", body), t.deps)).status, 400, `body ${JSON.stringify(body)}`);
  }
  const broken = new Request(URL, { method: "POST", headers: { Authorization: "Bearer tok-admin", "Content-Type": "application/json" }, body: "{not json" });
  assertEquals((await handleRequest(broken, t.deps)).status, 400);
  const huge = jsonRequest("admin", { action: "list", customer_id: CUSTOMER }, { "content-length": String(50 * 1024 * 1024) });
  assertEquals((await handleRequest(huge, t.deps)).status, 413);
});

// ---------------------------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------------------------

Deno.test("upload: stored encrypted, nothing sensitive returned, and logged without names", async () => {
  const t = standardWorld();
  const marker = "SECRET-MARKER-98765";
  const res = await handleRequest(uploadRequest("employee", CUSTOMER, file(pdf(marker), "Aadhaar front.pdf", "image/png")), t.deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Object.keys(body).sort(), ["file_name", "file_size", "id", "mime_type"]);
  assertEquals(body.mime_type, "application/pdf", "the declared type must be ignored; the real type is used");
  assertEquals(body.file_name, "Aadhaar front.pdf");

  const row = t.be.tables.customer_secure_attachments[0];
  assertEquals(row.storage_path, `customer/${CUSTOMER}/${body.id}.enc`);
  assertEquals(row.key_version, 1);
  assertEquals(row.uploaded_by, "employee");
  assert(!!row.wrapped_dek && !!row.file_iv, "wrapped key and iv must be stored");
  const stored = t.be.bucket("customer-secure").get(row.storage_path)!;
  assert(!asString(stored).includes(marker), "the stored object must not contain the plaintext");
  assertEquals(stored.length, pdf(marker).length + 16, "ciphertext = plaintext + 16 byte tag");
  assertEquals(t.be.bucket("crm-attachments").size, 0, "nothing may be written to the old bucket");

  const logs = t.be.tables.customer_attachment_access_log;
  assertEquals(logs.length, 1);
  assertEquals(logs[0].action, "upload");
  assert(!JSON.stringify(logs).includes("Aadhaar"), "file names must not be logged");
});

Deno.test("upload: someone who cannot open the customer, and an unknown customer, get the same 403 and nothing is stored", async () => {
  const t = standardWorld();
  const a = await handleRequest(uploadRequest("outsider", CUSTOMER, file(pdf("x"), "a.pdf")), t.deps);
  const unknown = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const b = await handleRequest(uploadRequest("employee", unknown, file(pdf("x"), "a.pdf")), t.deps);
  assertEquals(a.status, 403);
  assertEquals(b.status, 403);
  assertEquals(await a.json(), await b.json(), "the two refusals must be indistinguishable");
  assertEquals(t.be.tables.customer_secure_attachments.length, 0);
  assertEquals(t.be.bucket("customer-secure").size, 0);
  assertEquals(t.be.tables.customer_attachment_access_log.filter((l) => l.action === "denied").length, 2);
});

Deno.test("upload: wrong type (415), empty (400), too big (413), missing fields (400)", async () => {
  const t = standardWorld();
  const exeAsPdf = await handleRequest(uploadRequest("employee", CUSTOMER, file(exe(), "invoice.pdf", "application/pdf")), t.deps);
  assertEquals(exeAsPdf.status, 415);
  assertEquals((await exeAsPdf.json()).error, "unsupported_type");
  assertEquals((await handleRequest(uploadRequest("employee", CUSTOMER, file(new Uint8Array(0), "empty.pdf")), t.deps)).status, 400);
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  big.set(pdf("x"));
  assertEquals((await handleRequest(uploadRequest("employee", CUSTOMER, file(big, "big.pdf")), t.deps)).status, 413);
  assertEquals((await handleRequest(uploadRequest("employee", null, file(pdf("x"), "a.pdf")), t.deps)).status, 400);
  assertEquals((await handleRequest(uploadRequest("employee", CUSTOMER, null), t.deps)).status, 400);
  assertEquals(t.be.tables.customer_secure_attachments.length, 0);
});

Deno.test("upload: file names are cleaned", async () => {
  const t = standardWorld();
  const res = await handleRequest(uploadRequest("employee", CUSTOMER, file(png(), "../../etc/pass\u0001wd\u200b\u202egpj.png")), t.deps);
  assertEquals((await res.json()).file_name, "passwdgpj.png");
});

Deno.test("upload: a database failure removes the ciphertext again (no orphan object)", async () => {
  const t = standardWorld();
  const original = t.be.violatesUnique.bind(t.be);
  t.be.violatesUnique = () => true; // makes every insert fail
  const res = await handleRequest(uploadRequest("employee", CUSTOMER, file(pdf("x"), "a.pdf")), t.deps);
  t.be.violatesUnique = original;
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
  assertEquals(t.be.bucket("customer-secure").size, 0, "the uploaded object must be cleaned up");
});

Deno.test("a missing or broken key configuration fails closed with a generic error", async () => {
  const t = standardWorld();
  const secretText = t.kekEnv.keys["1"];
  t.kekEnv.keys = { "1": "too-short" };
  const res = await handleRequest(uploadRequest("employee", CUSTOMER, file(pdf("x"), "a.pdf")), t.deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
  assertEquals(t.be.tables.customer_secure_attachments.length, 0);
  assertEquals(t.be.bucket("customer-secure").size, 0);
  assert(consoleErrors.some((m) => m.includes("key configuration invalid")), "the fixed text must be logged");
  assert(!consoleErrors.join(" ").includes(secretText) && !consoleErrors.join(" ").includes("too-short"), "no secret in logs");
});

// ---------------------------------------------------------------------------------------------
// list / download / rename / delete
// ---------------------------------------------------------------------------------------------

Deno.test("list: only managers; an ordinary employee gets 403 and a 'denied' log row", async () => {
  const t = standardWorld();
  await uploadAs(t, "employee", pdf("one"), "one.pdf");
  const denied = await handleRequest(jsonRequest("employee", { action: "list", customer_id: CUSTOMER }), t.deps);
  assertEquals(denied.status, 403);
  assertEquals(await denied.json(), { error: "forbidden" });
  assert(t.be.tables.customer_attachment_access_log.some((l) => l.action === "denied" && l.detail?.attempted === "list"), "denied must be logged");

  const ok = await handleRequest(jsonRequest("manager", { action: "list", customer_id: CUSTOMER }), t.deps);
  assertEquals(ok.status, 200);
  const body = await ok.json();
  assertEquals(body.attachments.length, 1);
  assertEquals(Object.keys(body.attachments[0]).sort(), ["created_at", "file_name", "file_size", "from_lead", "id", "mime_type", "uploaded_by_name"]);
  assertEquals(body.attachments[0].from_lead, false);
  assertEquals(body.attachments[0].uploaded_by_name, "Name of employee");
});

Deno.test("list: newest first", async () => {
  const t = standardWorld();
  await uploadAs(t, "employee", pdf("1"), "first.pdf");
  await uploadAs(t, "employee", pdf("2"), "second.pdf");
  const body = await (await handleRequest(jsonRequest("manager", { action: "list", customer_id: CUSTOMER }), t.deps)).json();
  assertEquals(body.attachments.map((a: Row) => a.file_name), ["second.pdf", "first.pdf"]);
});

Deno.test("download: a manager gets the exact original bytes; others get the same 403 as for a missing file", async () => {
  const t = standardWorld();
  const original = pdf("ORIGINAL-CONTENT");
  const id = await uploadAs(t, "employee", original);

  const ok = await handleRequest(jsonRequest("manager", { action: "download", attachment_id: id }), t.deps);
  assertEquals(ok.status, 200);
  assertEquals(ok.headers.get("Content-Type"), "application/octet-stream");
  assertEquals(ok.headers.get("Cache-Control"), "no-store");
  assertEquals(ok.headers.get("X-Content-Type-Options"), "nosniff");
  assertEquals(ok.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(Array.from(new Uint8Array(await ok.arrayBuffer())), Array.from(original));

  const employee = await handleRequest(jsonRequest("employee", { action: "download", attachment_id: id }), t.deps);
  const missing = await handleRequest(jsonRequest("manager", { action: "download", attachment_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }), t.deps);
  assertEquals(employee.status, 403);
  assertEquals(missing.status, 403);
  assertEquals(await employee.json(), await missing.json());
});

Deno.test("download: a tampered stored file is detected (500, logged, nothing leaked)", async () => {
  const t = standardWorld();
  const id = await uploadAs(t, "employee", pdf("x"));
  const path = t.be.tables.customer_secure_attachments[0].storage_path;
  t.be.bucket("customer-secure").get(path)![3] ^= 0x01;
  const res = await handleRequest(jsonRequest("manager", { action: "download", attachment_id: id }), t.deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
  assert(t.be.tables.customer_attachment_access_log.some((l) => l.action === "decrypt_failed"), "decrypt_failed must be logged");
});

Deno.test("download: a ciphertext moved to another record cannot be decrypted (aad binding)", async () => {
  const t = standardWorld();
  const first = await uploadAs(t, "employee", pdf("first"));
  const second = await uploadAs(t, "employee", pdf("second"));
  const rows = t.be.tables.customer_secure_attachments;
  const a = rows.find((r) => r.id === first)!;
  const b = rows.find((r) => r.id === second)!;
  const bucket = t.be.bucket("customer-secure");
  bucket.set(b.storage_path, bucket.get(a.storage_path)!); // swap in the other file's bytes
  b.wrapped_dek = a.wrapped_dek;
  b.file_iv = a.file_iv;
  const res = await handleRequest(jsonRequest("manager", { action: "download", attachment_id: second }), t.deps);
  assertEquals(res.status, 500);
});

Deno.test("rename: managers only; the new name is cleaned; nothing else changes", async () => {
  const t = standardWorld();
  const id = await uploadAs(t, "employee", pdf("x"), "old.pdf");
  assertEquals((await handleRequest(jsonRequest("employee", { action: "rename", attachment_id: id, file_name: "x.pdf" }), t.deps)).status, 403);
  const res = await handleRequest(jsonRequest("manager", { action: "rename", attachment_id: id, file_name: "  New   name\u0000.pdf " }), t.deps);
  assertEquals(await res.json(), { id, file_name: "New name.pdf" });
  assertEquals((await handleRequest(jsonRequest("manager", { action: "rename", attachment_id: id }), t.deps)).status, 400);
});

Deno.test("delete: managers only; the object is removed first and the row stays if that fails", async () => {
  const t = standardWorld();
  const id = await uploadAs(t, "employee", pdf("x"));
  assertEquals((await handleRequest(jsonRequest("employee", { action: "delete", attachment_id: id }), t.deps)).status, 403);

  t.be.failRemoveInBucket = "customer-secure";
  assertEquals((await handleRequest(jsonRequest("manager", { action: "delete", attachment_id: id }), t.deps)).status, 500);
  assertEquals(t.be.tables.customer_secure_attachments.length, 1, "row must stay when the object could not be removed");

  t.be.failRemoveInBucket = null;
  const res = await handleRequest(jsonRequest("manager", { action: "delete", attachment_id: id }), t.deps);
  assertEquals(await res.json(), { id });
  assertEquals(t.be.tables.customer_secure_attachments.length, 0);
  assertEquals(t.be.bucket("customer-secure").size, 0);
});

// ---------------------------------------------------------------------------------------------
// Key rotation
// ---------------------------------------------------------------------------------------------

Deno.test("rewrap: admins only; after rotation old files still open even once the old key is removed", async () => {
  const t = standardWorld();
  const original = pdf("ROTATE-ME");
  const id = await uploadAs(t, "employee", original);

  assertEquals((await handleRequest(jsonRequest("manager", { action: "rewrap" }), t.deps)).status, 403);

  const oldKey = t.kekEnv.keys["1"];
  t.kekEnv.keys = { "1": oldKey, "2": randomKey() };
  t.kekEnv.current = "2";
  const res = await handleRequest(jsonRequest("admin", { action: "rewrap" }), t.deps);
  assertEquals(await res.json(), { rewrapped: 1, remaining: 0 });
  assertEquals(t.be.tables.customer_secure_attachments[0].key_version, 2);

  delete t.kekEnv.keys["1"]; // the old root key is retired
  const dl = await handleRequest(jsonRequest("manager", { action: "download", attachment_id: id }), t.deps);
  assertEquals(Array.from(new Uint8Array(await dl.arrayBuffer())), Array.from(original));

  // a new upload uses version 2
  await uploadAs(t, "employee", pdf("new"), "new.pdf");
  assertEquals(t.be.tables.customer_secure_attachments[1].key_version, 2);
  assertEquals((await handleRequest(jsonRequest("admin", { action: "rewrap", limit: 0 }), t.deps)).status, 400);
});

// ---------------------------------------------------------------------------------------------
// Import of a converted lead's files
// ---------------------------------------------------------------------------------------------

function addLeadFile(t: ReturnType<typeof setup>, id: string, name: string, bytes: Uint8Array | null, extra: Row = {}) {
  const path = `lead/${LEAD}/${name}`;
  t.be.tables.entity_attachments.push({
    id, entity_type: "lead", entity_id: LEAD, file_name: name, file_path: path, storage_missing: false,
    created_at: `2026-09-0${(t.be.tables.entity_attachments.length % 9) + 1}T00:00:00Z`, ...extra,
  });
  if (bytes) t.be.bucket("crm-attachments").set(path, bytes);
}
function convertedWorld() {
  const t = standardWorld();
  t.be.tables.leads.push({ id: LEAD, converted_to_customer_id: CUSTOMER });
  t.user("converter", { customers: new Set([CUSTOMER]), leads: new Set([LEAD]) });
  return t;
}
const importCall = (t: ReturnType<typeof setup>, who: string, offset?: number) =>
  handleRequest(jsonRequest(who, { action: "import_lead_files", lead_id: LEAD, customer_id: CUSTOMER, ...(offset === undefined ? {} : { offset }) }), t.deps);

Deno.test("import: copies usable files, reports skipped ones, never touches the lead's originals, and is repeatable", async () => {
  const t = convertedWorld();
  addLeadFile(t, "11111111-0000-4000-8000-000000000001", "site.pdf", pdf("LEAD-FILE-ONE"));
  addLeadFile(t, "11111111-0000-4000-8000-000000000002", "photo.png", png());
  addLeadFile(t, "11111111-0000-4000-8000-000000000003", "tool.exe", exe());
  addLeadFile(t, "11111111-0000-4000-8000-000000000004", "gone.pdf", null);
  addLeadFile(t, "11111111-0000-4000-8000-000000000005", "flagged.pdf", pdf("x"), { storage_missing: true });
  addLeadFile(t, "11111111-0000-4000-8000-000000000006", "nopath.pdf", null, { file_path: null });
  const originalsBefore = JSON.stringify([...t.be.bucket("crm-attachments").entries()].map(([k, v]) => [k, Array.from(v)]));
  const rowsBefore = JSON.stringify(t.be.tables.entity_attachments);

  const res = await importCall(t, "converter");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.imported, 2);
  assertEquals(body.already_imported, 0);
  assertEquals(body.next_offset, null);
  assertEquals(body.skipped.map((s: Row) => `${s.file_name}:${s.reason}`).sort(), ["gone.pdf:missing_file", "tool.exe:unsupported_type"]);

  const secure = t.be.tables.customer_secure_attachments;
  assertEquals(secure.length, 2);
  for (const row of secure) {
    assertEquals(row.source_lead_id, LEAD);
    assertEquals(row.customer_id, CUSTOMER);
    assertEquals(row.uploaded_by, "converter");
    assert(!asString(t.be.bucket("customer-secure").get(row.storage_path)!).includes("LEAD-FILE-ONE"), "imported copy must be encrypted");
  }
  assertEquals(JSON.stringify([...t.be.bucket("crm-attachments").entries()].map(([k, v]) => [k, Array.from(v)])), originalsBefore, "lead objects untouched");
  assertEquals(JSON.stringify(t.be.tables.entity_attachments), rowsBefore, "lead rows untouched");

  // the manager's list marks them as coming from the lead
  const listed = await (await handleRequest(jsonRequest("manager", { action: "list", customer_id: CUSTOMER }), t.deps)).json();
  assertEquals(listed.attachments.every((a: Row) => a.from_lead === true), true);

  // running it again adds nothing
  const again = await (await importCall(t, "converter")).json();
  assertEquals(again.imported, 0);
  assertEquals(again.already_imported, 2);
  assertEquals(t.be.tables.customer_secure_attachments.length, 2);

  // a new lead file later is picked up; the old ones are not duplicated
  addLeadFile(t, "11111111-0000-4000-8000-000000000007", "later.pdf", pdf("LATER"));
  const third = await (await importCall(t, "converter")).json();
  assertEquals([third.imported, third.already_imported], [1, 2]);
});

Deno.test("import: works in batches of 8 using next_offset", async () => {
  const t = convertedWorld();
  for (let i = 1; i <= 10; i++) addLeadFile(t, `11111111-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, `f${i}.pdf`, pdf(`file ${i}`));
  const first = await (await importCall(t, "converter", 0)).json();
  assertEquals([first.imported, first.next_offset], [8, 8]);
  const second = await (await importCall(t, "converter", first.next_offset)).json();
  assertEquals([second.imported, second.next_offset], [2, null]);
  assertEquals(t.be.tables.customer_secure_attachments.length, 10);
  assertEquals((await importCall(t, "converter", -1)).status, 400);
  assertEquals((await handleRequest(jsonRequest("converter", { action: "import_lead_files", lead_id: LEAD, customer_id: CUSTOMER, offset: "8" }), t.deps)).status, 400);
});

Deno.test("import: refused (same 403) unless the caller can read both records AND the lead is converted to that customer", async () => {
  const t = convertedWorld();
  addLeadFile(t, "11111111-0000-4000-8000-000000000001", "site.pdf", pdf("x"));
  t.user("sees-lead-only", { leads: new Set([LEAD]) });
  t.user("sees-customer-only", { customers: new Set([CUSTOMER]) });
  const refusals: unknown[] = [];
  for (const who of ["outsider", "sees-lead-only", "sees-customer-only"]) {
    const res = await importCall(t, who);
    assertEquals(res.status, 403, who);
    refusals.push(await res.json());
  }
  // the lead is converted to a DIFFERENT customer
  t.be.tables.leads[0].converted_to_customer_id = OTHER_CUSTOMER;
  const wrongLink = await importCall(t, "converter");
  assertEquals(wrongLink.status, 403);
  refusals.push(await wrongLink.json());
  // not converted at all
  t.be.tables.leads[0].converted_to_customer_id = null;
  const notConverted = await importCall(t, "converter");
  assertEquals(notConverted.status, 403);
  refusals.push(await notConverted.json());
  assertEquals(new Set(refusals.map((r) => JSON.stringify(r))).size, 1, "all refusals must look identical");
  assertEquals(t.be.tables.customer_secure_attachments.length, 0);
});

Deno.test("import: too-large and unreadable lead files are skipped with the right reason", async () => {
  const t = convertedWorld();
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  big.set(pdf("x"));
  addLeadFile(t, "11111111-0000-4000-8000-000000000001", "huge.pdf", big);
  addLeadFile(t, "11111111-0000-4000-8000-000000000002", "fine.pdf", pdf("fine"));
  const res = await (await importCall(t, "converter")).json();
  assertEquals(res.imported, 1);
  assertEquals(res.skipped, [{ file_name: "huge.pdf", reason: "too_large" }]);

  const t2 = convertedWorld();
  addLeadFile(t2, "11111111-0000-4000-8000-000000000001", "x.pdf", pdf("x"));
  t2.be.downloadErrorMessage = "connection reset";
  const res2 = await (await importCall(t2, "converter")).json();
  assertEquals(res2.skipped, [{ file_name: "x.pdf", reason: "read_failed" }]);
});

// ---------------------------------------------------------------------------------------------
// Securing the old, unencrypted customer file (admin list)
// ---------------------------------------------------------------------------------------------

const LEGACY_ID = "99999999-0000-4000-8000-000000000001";
function legacyWorld(bytes: Uint8Array | null = pdf("LEGACY-CONTENT")) {
  const t = standardWorld();
  const path = `customer/${CUSTOMER}/old.pdf`;
  t.be.tables.entity_attachments.push({ id: LEGACY_ID, entity_type: "customer", entity_id: CUSTOMER, file_name: "old.pdf", file_path: path, storage_missing: false });
  if (bytes) t.be.bucket("crm-attachments").set(path, bytes);
  return { t, path };
}
const listAs = (t: ReturnType<typeof setup>, who: string) => handleRequest(jsonRequest(who, { action: "list", customer_id: CUSTOMER }), t.deps);

Deno.test("legacy: an admin opening the list secures the old file; it is verified, then removed from the old place", async () => {
  const { t, path } = legacyWorld();
  const res = await listAs(t, "admin");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.attachments.length, 1);
  assertEquals(body.attachments[0].id, LEGACY_ID, "the new id is the old row's id");
  assertEquals(body.attachments[0].uploaded_by_name, "Legacy import");
  assertEquals(t.be.bucket("crm-attachments").has(path), false, "old plaintext object must be gone");
  assertEquals(t.be.tables.entity_attachments.length, 0, "old row must be gone");
  assert(t.be.tables.customer_attachment_access_log.some((l) => l.action === "legacy_secured"), "must be logged");

  const dl = await handleRequest(jsonRequest("admin", { action: "download", attachment_id: LEGACY_ID }), t.deps);
  assertEquals(asString(new Uint8Array(await dl.arrayBuffer())), asString(pdf("LEGACY-CONTENT")));
  // a second list changes nothing
  assertEquals((await (await listAs(t, "admin")).json()).attachments.length, 1);
});

Deno.test("legacy: a manager who is not an admin does NOT trigger it", async () => {
  const { t, path } = legacyWorld();
  const body = await (await listAs(t, "manager")).json();
  assertEquals(body.attachments.length, 0);
  assertEquals(t.be.bucket("crm-attachments").has(path), true);
  assertEquals(t.be.tables.entity_attachments.length, 1);
});

Deno.test("legacy: unusable old files are left untouched (invalid type, missing object)", async () => {
  const bad = legacyWorld(exe());
  assertEquals((await (await listAs(bad.t, "admin")).json()).attachments.length, 0);
  assertEquals(bad.t.be.bucket("crm-attachments").has(bad.path), true);
  assertEquals(bad.t.be.tables.entity_attachments.length, 1);

  const gone = legacyWorld(null);
  assertEquals((await (await listAs(gone.t, "admin")).json()).attachments.length, 0);
  assertEquals(gone.t.be.tables.entity_attachments.length, 1, "the old row must never be deleted when the file cannot be read");
});

Deno.test("legacy: if the encrypted copy cannot be verified, the old file stays and the bad copy is removed", async () => {
  const { t, path } = legacyWorld();
  t.be.corruptDownloadsInBucket = "customer-secure"; // verification reads corrupted bytes
  const res = await listAs(t, "admin");
  assertEquals(res.status, 200, "listing must still work");
  assertEquals(t.be.bucket("crm-attachments").has(path), true, "old file must be kept");
  assertEquals(t.be.tables.entity_attachments.length, 1, "old row must be kept");
  assertEquals(t.be.tables.customer_secure_attachments.length, 0, "the unverified copy must be removed");
  assertEquals(t.be.bucket("customer-secure").size, 0);
});

Deno.test("legacy: a half-finished earlier run is completed without duplicates, and only after verification", async () => {
  const { t, path } = legacyWorld();
  // Simulate a crash: the encrypted copy exists, but the old file was never removed. Build it with a real upload first.
  await listAs(t, "admin"); // normal run
  assertEquals(t.be.tables.entity_attachments.length, 0);
  // Put the old file and row back, as if the clean-up step had not happened.
  t.be.bucket("crm-attachments").set(path, pdf("LEGACY-CONTENT"));
  t.be.tables.entity_attachments.push({ id: LEGACY_ID, entity_type: "customer", entity_id: CUSTOMER, file_name: "old.pdf", file_path: path, storage_missing: false });
  const body = await (await listAs(t, "admin")).json();
  assertEquals(body.attachments.length, 1, "no duplicate");
  assertEquals(t.be.tables.entity_attachments.length, 0, "old row cleaned up");
  assertEquals(t.be.bucket("crm-attachments").has(path), false);

  // Same situation, but the existing encrypted copy does NOT match the old file: nothing is deleted.
  t.be.bucket("crm-attachments").set(path, pdf("A DIFFERENT FILE"));
  t.be.tables.entity_attachments.push({ id: LEGACY_ID, entity_type: "customer", entity_id: CUSTOMER, file_name: "old.pdf", file_path: path, storage_missing: false });
  await listAs(t, "admin");
  assertEquals(t.be.tables.entity_attachments.length, 1, "mismatch: old row must stay");
  assertEquals(t.be.bucket("crm-attachments").has(path), true, "mismatch: old file must stay");
  assertEquals(t.be.tables.customer_secure_attachments.length, 1, "the existing encrypted copy must not be touched");
});

// ---------------------------------------------------------------------------------------------
// Nothing sensitive in logs or console output
// ---------------------------------------------------------------------------------------------

Deno.test("access log rows and console output never contain file names, contents or keys", async () => {
  consoleErrors.length = 0;
  const t = convertedWorld();
  addLeadFile(t, "11111111-0000-4000-8000-000000000001", "Passport-scan.pdf", pdf("TOP-SECRET-LEAD-BYTES"));
  const id = await uploadAs(t, "employee", pdf("TOP-SECRET-UPLOAD-BYTES"), "Bank-statement.pdf");
  await importCall(t, "converter");
  await handleRequest(jsonRequest("manager", { action: "rename", attachment_id: id, file_name: "Renamed-secret.pdf" }), t.deps);
  await handleRequest(jsonRequest("manager", { action: "download", attachment_id: id }), t.deps);
  await handleRequest(jsonRequest("employee", { action: "list", customer_id: CUSTOMER }), t.deps);
  const everything = JSON.stringify(t.be.tables.customer_attachment_access_log) + consoleErrors.join(" ");
  for (const forbidden of ["Passport-scan", "Bank-statement", "Renamed-secret", "TOP-SECRET", t.kekEnv.keys["1"]]) {
    assert(!everything.includes(forbidden), `"${forbidden}" must never appear in a log`);
  }
  const actions = new Set(t.be.tables.customer_attachment_access_log.map((l) => l.action));
  for (const expected of ["upload", "import_lead_file", "rename", "download", "denied"]) {
    assert(actions.has(expected), `expected a '${expected}' log entry`);
  }
});
