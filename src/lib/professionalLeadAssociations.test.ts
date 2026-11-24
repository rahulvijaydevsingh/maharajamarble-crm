import { describe, expect, it } from "vitest";
import {
  buildReferralLinkInsert,
  getPreservedProfessionalIds,
  getProfessionalLeadRoleBadges,
} from "./professionalLeadAssociations";

describe("professional lead Group 3 associations", () => {
  it("creates a referrer-only link with the Group 3 marker", () => {
    expect(buildReferralLinkInsert("lead-1", { id: "professional-1" })).toEqual({
      lead_id: "lead-1",
      professional_id: "professional-1",
      is_primary_contact: false,
      contact_designation: "referrer",
    });
  });

  it("does not create a junction link for free-text referrals", () => {
    expect(buildReferralLinkInsert("lead-1", "Architect referral")).toBeNull();
    expect(buildReferralLinkInsert("lead-1", { name: "No stable ID" })).toBeNull();
  });

  it("shows both Referrer and Site Architect when one person has both roles", () => {
    const badges = getProfessionalLeadRoleBadges(
      "professional-1",
      "9876543210",
      {
        id: "lead-1",
        designation: "architect",
        phone: "9000000000",
        referred_by: { id: "professional-1", name: "A. Designer" },
      },
      [{
        lead_id: "lead-1",
        professional_id: "professional-1",
        is_primary_contact: true,
        contact_designation: "architect",
      }],
    );

    expect(badges).toEqual(["Site Architect", "Referrer"]);
  });

  it("treats an explicit referral ID as authoritative over a matching phone", () => {
    expect(getProfessionalLeadRoleBadges("professional-1", "9876543210", {
      id: "lead-1",
      referred_by: { id: "professional-2", phone: "9876543210" },
    })).toEqual([]);
  });

  it("does not apply one professional's junction role to a different lead", () => {
    expect(getProfessionalLeadRoleBadges(
      "professional-1",
      "9876543210",
      { id: "lead-2", phone: "9000000000" },
      [{
        lead_id: "lead-1",
        professional_id: "professional-1",
        is_primary_contact: true,
        contact_designation: "architect",
      }],
    )).toEqual([]);
  });

  it("recognizes a referral by its normalized phone without treating free text as a professional", () => {
    const badges = getProfessionalLeadRoleBadges("professional-1", "+91 98765 43210", {
      id: "lead-1",
      referred_by: { name: "A. Designer", phone: "9876543210" },
    });
    expect(badges).toEqual(["Referrer"]);
    expect(getProfessionalLeadRoleBadges("professional-1", "9876543210", {
      id: "lead-2",
      referred_by: "A. Designer",
    })).toEqual([]);
  });

  it("preserves Group 1 and the current Group 3 ID during stale-link cleanup", () => {
    expect(Array.from(getPreservedProfessionalIds(
      ["primary-professional", "additional-professional"],
      "referrer-professional",
    )).sort()).toEqual([
      "additional-professional",
      "primary-professional",
      "referrer-professional",
    ]);
  });

  it("preserves Group 1 only after the Group 3 referral is cleared", () => {
    expect(Array.from(getPreservedProfessionalIds(["site-professional"], null))).toEqual([
      "site-professional",
    ]);
  });
});
