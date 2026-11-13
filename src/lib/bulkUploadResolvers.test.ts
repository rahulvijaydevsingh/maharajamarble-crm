import { describe, expect, it } from "vitest";
import { mappedInitialNote, detectBulkLeadColumns } from "./bulkUploadColumnDetector";
import { normalizeDropdownValue, normalizePhone } from "./bulkUploadResolvers";

describe("lead bulk upload normalization", () => {
  it("converts active option labels and values to their canonical values", () => {
    const options = [{ label: "Field Visit", value: "field_visit" }, { label: "Plastering", value: "plastering" }];
    expect(normalizeDropdownValue("FIELD VISIT", options)).toBe("field_visit");
    expect(normalizeDropdownValue("plastering", options)).toBe("plastering");
  });

  it("uses snake case when a valid custom dropdown value is not yet in settings", () => {
    expect(normalizeDropdownValue("Premium Builder Referral", [])).toBe("premium_builder_referral");
  });

  it("strips Indian prefixes and punctuation from alternate phones", () => {
    expect(normalizePhone("+91 09876-543210")).toBe("9876543210");
    expect(normalizePhone("")).toBe("");
  });

  it("prefers a populated Initial Note and falls back to Notes", () => {
    const mapping = detectBulkLeadColumns(["Notes", "Initial Note", "Alternate Phone"]);
    expect(mappedInitialNote({ Notes: "Legacy", "Initial Note": "First visit booked" }, mapping)).toBe("First visit booked");
    expect(mappedInitialNote({ Notes: "Legacy", "Initial Note": "" }, mapping)).toBe("Legacy");
    expect(mapping["Alternate Phone"]).toBe("alternate_phone");
  });
});
