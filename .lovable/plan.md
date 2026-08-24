# Bulletproof bulk lead-to-professional matching

## What is verified
- The CRM already has a many-to-many `lead_professionals` relationship with a uniqueness rule, so one professional can safely be linked to many leads and a lead can retain multiple professional contacts.
- The current Excel import skips a row only when its phone matches an existing lead or customer. A phone match to a professional is allowed, but the automatic relationship is created only when the incoming lead itself has a professional designation.
- The import only searches professionals by phone. It does not use incoming name, firm, email, alternate phone, or a controlled review step to resolve a professional relationship.
- Existing records show 22 phone-matched lead/professional pairs without a relationship and 9 cross-name phone matches, confirming that the gap is real and that names cannot be used as an automatic identity key.

## Target behavior
Each spreadsheet row remains an independent lead unless it is a true duplicate of an existing lead/customer. A professional is a reusable contact relationship, not a reason to discard a new lead.

```text
Incoming lead row
  ├─ Existing lead/customer phone match → duplicate workflow; never create a silent second lead
  ├─ Professional identifier match → create lead + link to that professional
  ├─ Strong name/firm candidate only → user reviews and explicitly confirms, changes, or declines the link
  └─ No professional match → create one professional when the row is professional-designated; otherwise create only the lead
```

## Implementation plan
1. **Create one shared matching contract**
   - Add a typed, reusable bulk-import matching model and canonical normalizers for phone, email, name, and firm.
   - Ensure primary and alternate phone values are normalized before all comparisons; preserve the current plain-text staff-name invariant.

2. **Classify every imported row before inserting anything**
   - Fetch only the fields needed to build a batch-local index of accessible leads, customers, and professionals.
   - Keep lead/customer phone collisions as blocking duplicate rows.
   - Resolve a professional automatically only through deterministic identifiers: primary/alternate phone first, then a unique normalized email.
   - Identify name/firm-only candidates as **review required**, never auto-linking them. Include an explicit “no link” choice so legitimate same-name people remain separate.
   - Detect repeated professional identities inside the same file and make later rows reference the same proposed professional, preventing duplicate professional records in a single batch.

3. **Upgrade the review screen into an import decision table**
   - Add a clear relationship column and filters/counts for: existing-professional link, review required, new professional, no professional relationship, lead/customer duplicate, invalid, and excluded.
   - Provide per-row matching controls for review-required rows: select an existing professional, keep separate, or search by phone/name/firm. Batch actions will be limited to unambiguous rows.
   - Keep the existing row-selection controls and duplicate-skip option, but prevent import while a selected row is waiting for a required relationship decision.

4. **Make the importer idempotent and batch-safe**
   - Build one resolved match plan before the first insert, then execute each selected lead with its pre-approved professional decision.
   - Create every valid non-duplicate lead, link it through `lead_professionals`, and point its follow-up task to the resolved primary professional when applicable.
   - For a new professional shared by multiple rows in the file, create it once and reuse the resulting ID for every linked lead.
   - Use conflict-safe relationship upserts and keep lead creation successful even if a non-critical attachment/task/log side effect fails; report every row-level outcome accurately.

5. **Align manual and bulk behavior without changing existing lead semantics**
   - Reuse the same deterministic professional resolver in the manual smart-lead flow where practical, so phone/email handling does not drift.
   - Do not merge professionals, overwrite names, change existing assignments, or mutate existing lead/customer records during import. Name/firm similarities always stay review-only.

6. **Repair historical missed relationships safely**
   - Add an admin-only dry-run reconciliation view/action that lists the currently unlinked deterministic phone/email matches (including the verified phone-matched gap) before making any change.
   - Allow an administrator to approve only the displayed, exact-identifier links; insert missing `lead_professionals` rows with conflict protection. No automatic historical name-based linking.

7. **Protect performance, permissions, and regressions**
   - Add targeted database indexes only after inspecting the matching query plan; preserve existing RLS and ensure the matching screen only sees records the current user is allowed to access.
   - Verify with fixtures and live-preview tests: existing professional with different display name, two new leads for one new architect, same-file repeated phones, exact email match, ambiguous name/firm match, true lead/customer duplicate, alternate-phone match, rerun/idempotency, task linkage, and a non-admin visibility case.

## Technical notes
- Expected UI/API changes: `BulkUploadDialog`, a small shared resolver module, typed import state, and an admin reconciliation surface.
- Expected database change: likely indexes only; the existing relationship table, foreign keys, unique `(lead_id, professional_id)` rule, and access policies are already suitable for the relationship model.
- No automatic fuzzy matching, professional merging, or changes to existing records will be introduced.
