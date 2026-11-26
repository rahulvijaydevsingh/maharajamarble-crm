import { describe, expect, it } from "vitest";
import { upsertLeadById, type MergeableLeadRecord } from "./leadListMerge";

interface TestLead extends MergeableLeadRecord {
  name: string;
  updated_at: string;
  enriched_label?: string;
}

const lead = (overrides: Partial<TestLead> = {}): TestLead => ({
  id: "lead-1",
  name: "Amit Sharma",
  updated_at: "2026-11-23T09:00:00.000Z",
  ...overrides,
});

describe("upsertLeadById", () => {
  it("adds a new lead once at the top of the list", () => {
    const nextLeads = upsertLeadById([lead({ id: "lead-2" })], lead());

    expect(nextLeads).toHaveLength(2);
    expect(nextLeads[0].id).toBe("lead-1");
  });

  it("keeps one row when saved and realtime records have the same id", () => {
    const savedLead = lead({ enriched_label: "Preferred customer" });
    const nextLeads = upsertLeadById([savedLead], lead());

    expect(nextLeads).toHaveLength(1);
    expect(nextLeads[0]).toMatchObject({
      id: "lead-1",
      enriched_label: "Preferred customer",
    });
  });

  it("preserves enriched fields when a raw realtime record omits them", () => {
    const currentLead = lead({ enriched_label: "Priority lead" });
    const rawRealtimeLead = {
      id: "lead-1",
      name: "Amit Kumar",
      updated_at: "2026-11-23T10:00:00.000Z",
      enriched_label: undefined,
    } as TestLead;

    const nextLeads = upsertLeadById([currentLead], rawRealtimeLead);

    expect(nextLeads[0]).toMatchObject({
      name: "Amit Kumar",
      enriched_label: "Priority lead",
    });
  });

  it("does not replace a newer row with a stale realtime record", () => {
    const currentLead = lead({ updated_at: "2026-11-23T11:00:00.000Z", name: "Current name" });
    const staleLead = lead({ updated_at: "2026-11-23T10:00:00.000Z", name: "Stale name" });

    const nextLeads = upsertLeadById([currentLead], staleLead);

    expect(nextLeads).toEqual([currentLead]);
  });
});