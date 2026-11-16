import { describe, expect, it } from "vitest";
import { resolveProfessionalForProfessionalLead } from "./professionalResolver";

describe("resolveProfessionalForProfessionalLead", () => {
  it("resolves the single professional matching a builder lead's phone", () => {
    expect(resolveProfessionalForProfessionalLead("builder", "+91 90410 23000", [
      { id: "professional-amit", phone: "9041023000", status: "active" },
    ])).toBe("professional-amit");
  });

  it("does not resolve a homeowner lead even when a primary professional link exists", () => {
    expect(resolveProfessionalForProfessionalLead("owner", "9041023000", [
      { id: "professional-amit", phone: "9041023000", status: "active" },
    ], [
      { professional_id: "professional-amit", is_primary_contact: true },
    ])).toBeNull();
  });

  it("does not guess when multiple active professional profiles share the phone", () => {
    expect(resolveProfessionalForProfessionalLead("architect", "9041023000", [
      { id: "professional-one", phone: "9041023000", status: "active" },
      { id: "professional-two", phone: "9041023000", status: "active" },
    ])).toBeNull();
  });

  it("uses a matching primary lead-professional link to disambiguate duplicates", () => {
    expect(resolveProfessionalForProfessionalLead("architect", "9041023000", [
      { id: "professional-one", phone: "9041023000", status: "active" },
      { id: "professional-two", phone: "9041023000", status: "active" },
    ], [
      { professional_id: "professional-two", is_primary_contact: true },
    ])).toBe("professional-two");
  });
});