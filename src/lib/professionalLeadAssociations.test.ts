import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  buildAdditionalContactsContainsFilter,
  buildReferralLinkInsert,
  getPreservedProfessionalIds,
  getProfessionalLeadRoleBadges,
  resolveLinkedProfessionalsForLead,
} from "./professionalLeadAssociations";

describe("professional lead Group 3 associations", () => {
  it("sends valid JSONB Additional Contact containment and accepts a PostgREST 200", async () => {
    const requestUrls: string[] = [];
    let responseStatus = 0;
    const client = createClient("https://postgrest.test", "test-publishable-key", {
      global: {
        fetch: async (input) => {
          requestUrls.push(
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          );
          responseStatus = 200;
          return new Response(JSON.stringify([{ id: "lead-1" }]), {
            status: responseStatus,
            headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
          });
        },
      },
    });

    const filterValue = buildAdditionalContactsContainsFilter("professional-1");
    const { data, error } = await client
      .from("leads")
      .select("id")
      .contains("additional_contacts", filterValue)
      .is("deleted_at", null)
      .neq("status", "deleted");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "lead-1" }]);
    expect(responseStatus).toBe(200);

    const requestUrl = new URL(requestUrls[0]);
    expect(requestUrl.searchParams.get("additional_contacts")).toBe(
      'cs.[{"professional_id":"professional-1"}]',
    );
    expect(requestUrl.searchParams.get("deleted_at")).toBe("is.null");
    expect(requestUrl.searchParams.get("status")).toBe("neq.deleted");
    expect(requestUrls[0]).not.toContain("[object Object]");
  });

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

  it("returns one Site Architect badge for an Additional Contact with a Group 1 link", () => {
    const badges = getProfessionalLeadRoleBadges(
      "professional-1",
      "9876543210",
      {
        id: "lead-1",
        additional_contacts: [{
          professional_id: "professional-1",
          designation: "architect",
          phone: "9876543210",
        }],
      },
      [{
        lead_id: "lead-1",
        professional_id: "professional-1",
        is_primary_contact: false,
        contact_designation: "architect",
      }],
    );

    expect(badges).toEqual(["Site Architect"]);
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

  it("resolves a Group 3 referrer using only the professional primary phone", () => {
    const linked = resolveLinkedProfessionalsForLead(
      { id: "lead-1" },
      [{ lead_id: "lead-1", professional_id: "professional-1", is_primary_contact: false, contact_designation: "referrer" }],
      [{ id: "professional-1", name: "GAGAN", phone: "9876543210", alternate_phone: "9999999999", professional_type: "builder" }],
    );

    expect(linked).toEqual([{
      id: "professional-1",
      name: "GAGAN",
      phone: "9876543210",
      professionalTypeLabel: "Builder",
      roleBadges: ["Referrer"],
      designationDisplay: "Builder · Referrer",
    }]);
  });

  it("keeps multiple linked professionals as distinct rows", () => {
    const linked = resolveLinkedProfessionalsForLead(
      { id: "lead-1" },
      [
        { lead_id: "lead-1", professional_id: "architect-1", is_primary_contact: true, contact_designation: "architect" },
        { lead_id: "lead-1", professional_id: "kitchen-1", is_primary_contact: false, contact_designation: "referrer" },
      ],
      [
        { id: "architect-1", name: "Asha", phone: "9000000001", professional_type: "architect" },
        { id: "kitchen-1", name: "Kiran", phone: "9000000002", professional_type: "kitchen_maker" },
      ],
    );

    expect(linked.map((professional) => professional.designationDisplay)).toEqual([
      "Architect · Site Architect",
      "Kitchen Maker · Referrer",
    ]);
  });

  it("deduplicates a dual-role professional with combined roles", () => {
    const linked = resolveLinkedProfessionalsForLead(
      { id: "lead-1", referred_by: { id: "professional-1" } },
      [
        { lead_id: "lead-1", professional_id: "professional-1", is_primary_contact: true, contact_designation: "architect" },
        { lead_id: "lead-1", professional_id: "professional-1", is_primary_contact: false, contact_designation: "referrer" },
      ],
      [{ id: "professional-1", name: "Asha", phone: "9000000001", professional_type: "architect" }],
    );

    expect(linked).toHaveLength(1);
    expect(linked[0].designationDisplay).toBe("Architect · Site Architect, Referrer");
  });

  it("excludes free-text referrals and keeps a missing primary phone null", () => {
    const noReferral = resolveLinkedProfessionalsForLead(
      { id: "lead-1", referred_by: "Architect referral" },
      [],
      [{ id: "professional-1", name: "Asha", phone: "9000000001", professional_type: "architect" }],
    );
    const linkedWithoutPhone = resolveLinkedProfessionalsForLead(
      { id: "lead-2" },
      [{ lead_id: "lead-2", professional_id: "professional-2", is_primary_contact: false, contact_designation: "referrer" }],
      [{ id: "professional-2", name: "Kiran", phone: null, alternate_phone: "9000000002", professional_type: "builder" }],
    );

    expect(noReferral).toEqual([]);
    expect(linkedWithoutPhone[0].phone).toBeNull();
  });
});
