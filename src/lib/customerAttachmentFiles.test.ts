import { describe, expect, it } from "vitest";
import { addStagedFile, getPreviewKind, MAX_STAGED_ATTACHMENTS } from "./customerAttachmentFiles";

const file = (name: string, size = 100, type = "") => ({ name, size, type }) as unknown as File;

describe("getPreviewKind", () => {
  it("recognises pictures and PDFs by type", () => {
    expect(getPreviewKind({ name: "a.jpg", type: "image/jpeg" })).toBe("image");
    expect(getPreviewKind({ name: "a.png", type: "image/png" })).toBe("image");
    expect(getPreviewKind({ name: "a.pdf", type: "application/pdf" })).toBe("pdf");
  });

  it("falls back to the extension when the browser reports no type", () => {
    expect(getPreviewKind({ name: "SCAN.JPEG", type: "" })).toBe("image");
    expect(getPreviewKind({ name: "quote.PDF", type: "" })).toBe("pdf");
  });

  it("has no preview for anything else", () => {
    expect(getPreviewKind({ name: "notes.txt", type: "text/plain" })).toBe("none");
    expect(getPreviewKind({ name: "noextension", type: "" })).toBe("none");
  });
});

describe("addStagedFile", () => {
  it("adds a picked file straight away", () => {
    const first = file("a.jpg");
    const result = addStagedFile([], first);
    expect(result.error).toBeNull();
    expect(result.files).toEqual([first]);
  });

  it("keeps the earlier files and appends the new one", () => {
    const a = file("a.jpg");
    const b = file("b.pdf");
    expect(addStagedFile([a], b).files).toEqual([a, b]);
  });

  it("refuses the same file twice and says so", () => {
    const a = file("a.jpg", 100);
    const result = addStagedFile([a], file("a.jpg", 100));
    expect(result.files).toEqual([a]);
    expect(result.error).toBe("This file is already in the list.");
  });

  it("treats a file with the same name but another size as a different file", () => {
    const a = file("a.jpg", 100);
    expect(addStagedFile([a], file("a.jpg", 200)).files).toHaveLength(2);
  });

  it("stops at the limit and says so", () => {
    const existing = Array.from({ length: MAX_STAGED_ATTACHMENTS }, (_, i) => file("f" + i + ".jpg", i + 1));
    const result = addStagedFile(existing, file("one-more.jpg", 999));
    expect(result.files).toHaveLength(MAX_STAGED_ATTACHMENTS);
    expect(result.error).toBe("You can attach up to 10 files at a time.");
  });
});
