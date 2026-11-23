# Fix duplicate rows after creating a lead

## Confirmed cause

The lead list currently adds a newly saved lead to the screen twice: once immediately after the save succeeds, and again when the live update for that same lead arrives. The customer list already prevents this by merging records by their unique ID.

The recent database check did not find duplicate lead records created in the last seven days, so this plan targets the on-screen duplication rather than altering existing CRM data.

## Plan

1. Add a small lead-list merge helper that inserts a lead only when its ID is not already present, and otherwise refreshes the existing row.
2. Use that helper for both the immediate new-lead save and the live-update path, matching the established customer behavior.
3. Add focused automated coverage proving that receiving the same lead twice results in one row and that a later update refreshes that row.
4. Run the focused test and TypeScript check, then verify a newly created lead appears once without requiring a page refresh.

## Scope and safeguards

- Change only the lead list state handling and its focused test.
- Do not modify lead creation, permissions, assignments, database data, or unrelated customer/professional behavior.
- Existing historical records will remain untouched.

## Technical details

```text
Save succeeds ──────> merge by lead ID ──> one visible row
Live insert arrives ─> merge by lead ID ──> same row refreshed, not duplicated
```