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
  
  
# Detailed Implementation Plan — Bulk Upload Enhancements
  All phases below build on top of the existing plan and reference actual files, functions, and data structures from the codebase.
  ---
  ## Phase 1: Smart File Detection & Auto Column Mapping
  ### 1.1 Problem Statement
  The current bulk upload assumes a fixed template structure. When a user uploads a file generated by a field visit app, a WhatsApp export, or any third-party tool, the columns won't match. Today the user must reformat the file in Excel before uploading. We want the system to **automatically detect standard files** and only show a mapping UI when the file is non-standard.
  ### 1.2 File Detection Logic
  **Where to implement:** New utility file `src/lib/bulkUploadColumnDetector.ts`
  **Detection algorithm (runs immediately after file parse, before any row processing):**
  ```
  Step 1: Parse headers from Row 1 of the uploaded sheet
  Step 2: Normalize each header string:
           - Trim whitespace
           - Lowercase
           - Remove special characters except spaces and underscores
           - Replace spaces with underscores
           - Example: "Mobile No." → "mobile_no"
                     "Contact Number" → "contact_number"
                     "Phone Number*" → "phone_number"
  Step 3: Compare against the STANDARD_TEMPLATE_HEADERS map:
  const STANDARD_HEADERS: Record<string, string[]> = {
    name:              ["name", "full_name", "lead_name", "customer_name"],
    phone:             ["phone", "mobile", "mobile_no", "mobile_number",
                        "phone_number", "contact_number", "contact_no",
                        "primary_phone", "primary_phone_number"],
    alternate_phone:   ["alternate_phone", "alt_phone", "mobile_2",
                        "mobile2", "secondary_phone", "alt_mobile",
                        "alternate_mobile", "phone_2"],
    email:             ["email", "email_address", "email_id", "mail"],
    designation:       ["designation", "title", "role", "position",
                        "contact_type", "person_type"],
    firm_name:         ["firm_name", "company", "company_name",
                        "firm", "organization", "organisation"],
    site_location:     ["site_location", "address", "site_address",
                        "location", "site", "site_address",
                        "project_location", "site_address"],
    construction_stage:["construction_stage", "stage",
                        "construction_status", "build_stage"],
    estimated_quantity:["estimated_quantity", "quantity", "est_quantity",
                        "approx_quantity", "est_qty", "quantity_sqft"],
    material_interests:["material_interests", "materials",
                        "material_interest", "interested_materials",
                        "product_interest"],
    source:            ["source", "lead_source", "source_type",
                        "lead_origin", "origin"],
    assigned_to:       ["assigned_to", "assignee", "assigned",
                        "assigned_staff", "sales_person", "owner",
                        "responsible", "handler"],
    priority:          ["priority", "priority_level", "urgency",
                        "priority_level", "priority_value"],
    notes:             ["notes", "remarks", "comments", "remarks",
                        "additional_info", "extra_info"],
  };
  Step 4: Score the match:
    - For each standard field, check if ANY alias matches ANY header
    - Calculate matchScore = matchedFields / totalStandardFields
    - If matchScore >= 0.7 → STANDARD FILE (auto-map, skip mapping UI)
    - If matchScore >= 0.4 → PARTIAL MATCH (pre-fill mapping, show UI)
    - If matchScore < 0.4 → NON-STANDARD (show mapping UI with empty mapping)
  ```
  ### 1.3 Auto-Map Behavior (Standard File)
  When `matchScore >= 0.7`:
  - Automatically map columns using the alias map
  - Skip the mapping UI entirely
  - Show a brief toast: `"Standard template detected. 14 of 16 columns auto-mapped."`
  - Proceed directly to validation phase
  - Log which columns were auto-mapped for audit trail
  ### 1.4 Partial / Non-Standard Mapping UI
  **Where to implement:** New component `src/components/leads/bulk-upload/ColumnMappingStep.tsx`
  **When shown:** Only when `matchScore < 0.7`
  **UI Layout:**
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │  Column Mapping                                                 │
  │  We detected some columns but need your help mapping the rest.  │
  │                                                                 │
  │  ┌───────────────────────────────────────────────────────────┐  │
  │  │ File Column          →    CRM Field                       │  │
  │  │─────────────────────────────────────────────────────────  │  │
  │  │ "Contact Person"     →    [Name              ▼]  ✓ Auto  │  │
  │  │ "Mobile No"          →    [Phone             ▼]  ✓ Auto  │  │
  │  │ "Alt Contact"        →    [Alternate Phone   ▼]  ✓ Auto  │  │
  │  │ "Org Name"           →    [Firm Name         ▼]  ✓ Auto  │  │
  │  │ "Area"               →    [— Not Mapped —    ▼]  ⚠ Map  │  │
  │  │ "Stage of Work"      →    [— Not Mapped —    ▼]  ⚠ Map  │  │
  │  │ "Col_8"              →    [— Skip Column —   ▼]          │  │
  │  └───────────────────────────────────────────────────────────┘  │
  │                                                                 │
  │  ⚠ 2 columns need manual mapping                                │
  │  1 column will be skipped                                       │
  │                                                                 │
  │  [Auto-Detect Unmapped]   [Skip All Unmapped]   [Continue →]    │
  └─────────────────────────────────────────────────────────────────┘
  ```
  **Detailed UI behavior:**
  - Each row shows the raw file column name on the left, a dropdown on the right
  - The dropdown contains all CRM fields plus `"— Skip Column —"` and `"— Not Mapped —"`
  - Pre-filled fields show a green `✓ Auto` badge
  - Unmapped fields show an orange `⚠ Map` badge
  - A "Skip Column" option means the column data will be ignored
  - A "Not Mapped" option means the field is required but no column matched — this will show as a validation error unless the field is optional
  - The "Auto-Detect Unmapped" button re-runs fuzzy matching only on unmapped columns
  - The "Skip All Unmapped" button maps all unmapped columns to "Skip"
  - The "Continue" button is disabled until all REQUIRED fields (name, phone) are mapped
  - Required fields are: `name`, `phone`
  - Recommended fields are: `designation`, `source`, `assigned_to`
  - All other fields are optional
  **Fuzzy matching for unmapped columns:**
  For columns that didn't match in Step 3, run a secondary pass:
  - Use Levenshtein distance with threshold ≤ 3
  - Check substring matches (e.g., "mobile" in "mobile_number_2")
  - Check semantic synonyms via a small hardcoded map
  - Present the best guess as a suggestion but don't auto-apply
  ### 1.5 Data Flow
  ```
  User uploads file
      ↓
  Parse headers (Row 1)
      ↓
  Normalize headers
      ↓
  Match against STANDARD_HEADERS
      ↓
  ┌──────────────────────────────────────────┐
  │ matchScore >= 0.7 → AUTO-MAP            │
  │   → Skip mapping UI                     │
  │   → Proceed to validation               │
  ├──────────────────────────────────────────┤
  │ matchScore 0.4–0.7 → PARTIAL            │
  │   → Show mapping UI pre-filled          │
  │   → User confirms/adjusts               │
  │   → Proceed to validation               │
  ├──────────────────────────────────────────┤
  │ matchScore < 0.4 → NON-STANDARD         │
  │   → Show mapping UI empty               │
  │   → User maps all required fields       │
  │   → Proceed to validation               │
  └──────────────────────────────────────────┘
      ↓
  Validation phase (existing)
      ↓
  Import phase (existing)
  ```
  ### 1.6 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/lib/bulkUploadColumnDetector.ts` | CREATE | Header normalization, alias matching, scoring |
  | `src/components/leads/bulk-upload/ColumnMappingStep.tsx` | CREATE | Mapping UI component |
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Insert mapping step between file parse and validation |
  | `src/types/lead.ts` | MODIFY | Add `ColumnMappingResult` interface |
  ### 1.7 Type Definitions
  ```typescript
  // Add to src/types/lead.ts
  export interface ColumnMappingResult {
    /** Raw header from file */
    rawHeader: string;
    /** Normalized header */
    normalizedHeader: string;
    /** Mapped CRM field key, or null if skipped/unmapped */
    mappedField: string | null;
    /** Whether this was auto-detected */
    autoDetected: boolean;
    /** Confidence score 0-1 */
    confidence: number;
  }
  export interface FileDetectionResult {
    /** Overall match score 0-1 */
    matchScore: number;
    /** 'standard' | 'partial' | 'non_standard' */
    detection: 'standard' | 'partial' | 'non_standard';
    /** Per-column mapping results */
    mappings: ColumnMappingResult[];
    /** Headers that could not be mapped */
    unmappedHeaders: string[];
    /** Headers that were auto-mapped */
    autoMappedCount: number;
  }
  ```
  ---
  ## Phase 2: Source Preservation & Smart Source Resolution
  ### 2.1 Problem Statement
  The previous suggestion was to set `source = 'bulk_import'` on all imported leads. This is wrong because:
  - Field visit files already contain the actual source (e.g., "field_visit", "walk_in")
  - Overwriting the source destroys the actual acquisition channel data
  - Reporting on lead sources becomes meaningless if everything says "bulk_import"
  ### 2.2 Proposed Approach: Source Resolution Chain
  Instead of overwriting, implement a **source resolution chain** that preserves the file's source data and falls back intelligently:
  ```
  Resolution order:
  1. File has a "source" column → USE IT (map value to valid enum)
  2. File has no source column BUT has a "source" header mapped → USE IT
  3. File has no source info AT ALL → fall back to a configurable default
  4. The default is set per-upload in the mapping UI, NOT hardcoded
  ```
  ### 2.3 Source Value Normalization
  The file may contain source values that don't exactly match the CRM enum. Build a normalization map:
  **Where to implement:** `src/lib/bulkUploadSourceNormalizer.ts`
  ```typescript
  const SOURCE_ALIASES: Record<string, string> = {
    // Standard values (exact match)
    "walk_in": "walk_in",
    "walk-in": "walk_in",
    "walkin": "walk_in",
    "walk in": "walk_in",
    "field_visit": "field_visit",
    "field visit": "field_visit",
    "fieldvisit": "field_visit",
    "field-visit": "field_visit",
    "site_visit": "field_visit",  // Map site_visit to field_visit
    "cold_call": "cold_call",
    "cold call": "cold_call",
    "coldcall": "cold_call",
    "online_enquiry": "online_enquiry",
    "online enquiry": "online_enquiry",
    "online": "online_enquiry",
    "website": "online_enquiry",
    "web": "online_enquiry",
    "professional_referral": "professional_referral",
    "professional referral": "professional_referral",
    "referral": "professional_referral",
    "architect_referral": "professional_referral",
    "builder_referral": "professional_referral",
    "instagram": "instagram",
    "insta": "instagram",
    "facebook": "facebook",
    "fb": "facebook",
    "google": "google",
    "google_ads": "google",
    "google ads": "google",
    "justdial": "justdial",
    "just dial": "justdial",
    "[justdial.com](http://justdial.com)": "justdial",
    "other": "other",
  };
  ```
  **Normalization function:**
  ```typescript
  export function normalizeSource(raw: string): string | null {
    const normalized = raw.trim().toLowerCase()
      .replace(/[\s_-]+/g, '_')
      .replace(/[^\w]/g, '');
    // Direct lookup
    if (SOURCE_ALIASES[normalized]) return SOURCE_ALIASES[normalized];
    // Fuzzy: check if any alias contains the normalized value
    for (const [alias, target] of Object.entries(SOURCE_ALIASES)) {
      if (alias.includes(normalized) || normalized.includes(alias)) {
        return target;
      }
    }
    return null; // Could not normalize
  }
  ```
  ### 2.4 Default Source for Non-Standard Files
  When a file has NO source column at all:
  **UI addition to ColumnMappingStep:**
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │  ⚠ No "Source" column detected in this file.                    │
  │                                                                 │
  │  Select the default source for all leads in this file:          │
  │                                                                 │
  │  ○ Walk-in                                                      │
  │  ● Field Visit        ← pre-selected (most common)              │
  │  ○ Cold Call                                                    │
  │  ○ Online Enquiry                                               │
  │  ○ Professional Referral                                        │
  │  ○ Other: [________________]                                    │
  │                                                                 │
  │  ☑ Apply this source to ALL leads in this file                  │
  │  ☐ Let me set source per-row in the preview                     │
  └─────────────────────────────────────────────────────────────────┘
  ```
  **Default selection logic:**
  - If the file was detected as a field visit file (headers contain "site", "visit", "location"), pre-select "Field Visit"
  - If headers contain "walk", pre-select "Walk-in"
  - Otherwise default to "Field Visit" (most common bulk upload scenario)
  - The user can override
  ### 2.5 Source Column Present But Value Unrecognized
  If the file HAS a source column but a row's value doesn't match any known alias:
  - Mark the row with a warning: `"Source 'xyz' not recognized. Will default to 'field_visit'."`
  - Show it in the validation summary
  - Allow the user to override per-row in the preview table
  - Do NOT block the import
  ### 2.6 What Gets Stored
  The `source` field on the `leads` table stores the **actual acquisition source** from the file. The fact that it came via bulk upload is tracked separately:
  ```typescript
  // Add to leads table via migration:
  ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS import_batch_id UUID,
  ADD COLUMN IF NOT EXISTS import_method TEXT DEFAULT NULL;
  -- import_method = 'bulk_upload' | 'manual' | 'api' | NULL
  ```
  This way:
  - `source` = "field_visit" (actual source, preserved)
  - `import_method` = "bulk_upload" (how it entered the system)
  - `import_batch_id` links to the batch for undo functionality
  ### 2.7 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/lib/bulkUploadSourceNormalizer.ts` | CREATE | Source alias map and normalization |
  | `src/components/leads/bulk-upload/ColumnMappingStep.tsx` | MODIFY | Add default source selector |
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Pass source through validation/import |
  | Migration file | CREATE | Add `import_batch_id` and `import_method` columns |
  ---
  ## Phase 3: Assignment Resolution for Non-Standard Files
  ### 3.1 Problem Statement
  The standard template has an `assigned_to` column. Non-standard files may:
  - Have no assignment column at all
  - Have a column with staff names that don't exactly match `profiles.full_name`
  - Have email addresses instead of names
  - Have names with different casing or partial names
  ### 3.2 Resolution Chain for Assignment
  ```
  Resolution order:
  1. File has "assigned_to" column with exact name match → USE IT
  2. File has email addresses → resolve via [profiles.email](http://profiles.email)
  3. File has partial names → fuzzy match against profiles.full_name
  4. No assignment info → apply default assignment rule
  ```
  ### 3.3 Assignment Normalization
  **Where to implement:** `src/lib/bulkUploadAssignmentResolver.ts`
  ```typescript
  export interface AssignmentResolution {
    /** The resolved full_name to store */
    resolvedName: string;
    /** How it was resolved */
    method: 'exact_name' | 'email_lookup' | 'fuzzy_name' | 'default' | 'unresolved';
    /** Confidence 0-1 */
    confidence: number;
    /** Original value from file */
    originalValue: string;
  }
  export function resolveAssignment(
    rawValue: string,
    profiles: Array<{ id: string; full_name: string; email: string }>
  ): AssignmentResolution {
    if (!rawValue || rawValue.trim() === '') {
      return { resolvedName: '', method: 'unresolved', confidence: 0, originalValue: rawValue };
    }
    const normalized = rawValue.trim().toLowerCase();
    // 1. Exact name match
    const exactMatch = profiles.find(
      p => p.full_name.toLowerCase() === normalized
    );
    if (exactMatch) {
      return { resolvedName: exactMatch.full_name, method: 'exact_name', confidence: 1, originalValue: rawValue };
    }
    // 2. Email lookup
    const emailMatch = profiles.find(
      p => [p.email](http://p.email).toLowerCase() === normalized
    );
    if (emailMatch) {
      return { resolvedName: emailMatch.full_name, method: 'email_lookup', confidence: 0.95, originalValue: rawValue };
    }
    // 3. Fuzzy name match (case-insensitive, partial)
    const fuzzyMatch = profiles.find(p => {
      const profileName = p.full_name.toLowerCase();
      return profileName.includes(normalized) || normalized.includes(profileName);
    });
    if (fuzzyMatch) {
      return { resolvedName: fuzzyMatch.full_name, method: 'fuzzy_name', confidence: 0.7, originalValue: rawValue };
    }
    return { resolvedName: rawValue, method: 'unresolved', confidence: 0, originalValue: rawValue };
  }
  ```
  ### 3.4 Default Assignment Rule for Non-Standard Files
  When no assignment column exists or the value can't be resolved:
  **UI addition to ColumnMappingStep:**
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │  ⚠ No "Assigned To" column detected.                            │
  │                                                                 │
  │  Select default assignment for unmapped leads:                  │
  │                                                                 │
  │  ● Round-Robin (distribute evenly across active staff)          │
  │  ○ Assign to me (Nipun Tantia)                                  │
  │  ○ Specific person: [Select Staff ▼]                            │
  │  ○ Leave unassigned (assign later)                              │
  │                                                                 │
  │  ☑ Apply this rule ONLY to rows where assignment couldn't       │
  │    be resolved from the file                                    │
  └─────────────────────────────────────────────────────────────────┘
  ```
  **Round-robin implementation:**
  ```typescript
  function assignRoundRobin(
    profiles: Array<{ id: string; full_name: string; email: string }>,
    count: number
  ): string[] {
    const assignments: string[] = [];
    for (let i = 0; i < count; i++) {
      const profile = profiles[i % profiles.length];
      assignments.push(profile.full_name);
    }
    return assignments;
  }
  ```
  ### 3.5 Unresolved Assignment Handling
  When a row's assignment value can't be resolved to any profile:
  - Show a warning in the validation summary: `"Row 14: 'Rajesh K' not found in staff. Will be left unassigned."`
  - The lead is still imported but with `assigned_to` set to the default rule
  - The row is highlighted in the preview table with an orange badge
  - The user can manually override per-row in the preview
  ### 3.6 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/lib/bulkUploadAssignmentResolver.ts` | CREATE | Assignment resolution chain |
  | `src/components/leads/bulk-upload/ColumnMappingStep.tsx` | MODIFY | Add default assignment selector |
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Wire assignment resolution into import |
  ---
  ## Phase 4: Priority Calculation in Bulk Upload (Parity with Lead Form)
  ### 4.1 Problem Statement
  The lead entry form `SmartLeadForm`) calculates priority based on `FollowUpPriority`:
  - `urgent` → priority = 1
  - `normal` → priority = 3
  - `low` → priority = 5
  The bulk upload currently does NOT implement this. If the file has a priority column, it's used as-is. If not, priority defaults to 3. There's no construction-stage-based urgency boost.
  ### 4.2 Priority Resolution Chain for Bulk Upload
  ```
  Resolution order:
  1. File has "priority" column with numeric value (1-5) → USE IT
  2. File has "priority" column with text value → normalize to 1-5
  3. File has NO priority column → calculate from construction_stage
  4. No construction_stage either → default to 3 (Medium)
  ```
  ### 4.3 Priority Value Normalization
  **Where to implement:** `src/lib/bulkUploadPriorityResolver.ts`
  ```typescript
  const PRIORITY_ALIASES: Record<string, number> = {
    // Numeric strings
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
    // Text aliases
    "very_high": 1, "very high": 1, "critical": 1, "urgent": 1, "hot": 1,
    "high": 2, "important": 2, "high_priority": 2,
    "medium": 3, "normal": 3, "moderate": 3, "standard": 3,
    "low": 4, "low_priority": 4,
    "very_low": 5, "very low": 5, "cold": 5, "low_urgency": 5,
  };
  export function normalizePriority(raw: string): number | null {
    const normalized = raw.trim().toLowerCase()
      .replace(/[\s_-]+/g, '_');
    if (PRIORITY_ALIASES[normalized] !== undefined) {
      return PRIORITY_ALIASES[normalized];
    }
    // Try parsing as number
    const num = parseInt(normalized, 10);
    if (num >= 1 && num <= 5) return num;
    return null;
  }
  ```
  ### 4.4 Construction-Stage-Based Priority Calculation
  When no priority column exists, calculate priority from construction stage (matching the lead form logic):
  ```typescript
  export function calculatePriorityFromStage(
    constructionStage: string | null
  ): number {
    if (!constructionStage) return 3; // Default medium
    const stageUrgency: Record<string, number> = {
      "flooring_ready": 1,   // Urgent → priority 1
      "renovation": 1,       // Urgent → priority 1
      "plastering": 3,       // Medium → priority 3
      "structure_complete": 3, // Medium → priority 3
      "excavation": 5,       // Low → priority 5
    };
    const normalized = constructionStage.trim().toLowerCase()
      .replace(/[\s_-]+/g, '_');
    return stageUrgency[normalized] ?? 3;
  }
  ```
  ### 4.5 Priority Column Present But Value Unrecognized
  If the file has a priority column but a row's value doesn't match any alias:
  - Mark with a warning: `"Row 8: Priority 'super_urgent' not recognized. Will calculate from construction stage."`
  - Fall back to construction-stage calculation
  - If no construction stage either, default to 3
  - Show in validation summary
  ### 4.6 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/lib/bulkUploadPriorityResolver.ts` | CREATE | Priority normalization and stage-based calculation |
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Wire priority resolution into row processing |
  ---
  ## Phase 5: Validation Summary & Pre-Import Preview
  ### 5.1 Problem Statement
  The current flow parses the file and immediately starts processing. The user doesn't see a summary of what will happen until after import. We need a validation summary BEFORE import starts.
  ### 5.2 Validation Summary UI
  **Where to implement:** Modify `src/components/leads/BulkUploadDialog.tsx`
  **New step between mapping and import:**
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │  Import Preview & Validation                                    │
  │                                                                 │
  │  ┌───────────────────────────────────────────────────────────┐  │
  │  │  Summary                                                  │  │
  │  │  ─────────────────────────────────────────────────────     │  │
  │  │  Total rows:           145                                │  │
  │  │  ✓ Valid:              132                                │  │
  │  │  ⚠ Warnings:           8                                  │  │
  │  │  ✗ Errors:             6                                  │  │
  │  │  ⊘ Duplicates:         4                                  │  │
  │  │                                                           │  │
  │  │  Source: Field Visit (from file)                          │  │
  │  │  Assignment: 128 resolved, 4 unresolved                   │  │
  │  │  Priority: 95 from file, 37 calculated from stage        │  │
  │  │                                                           │  │
  │  │  [View Errors] [View Warnings] [View Duplicates]          │  │
  │  └───────────────────────────────────────────────────────────┘  │
  │                                                                 │
  │  ┌───────────────────────────────────────────────────────────┐  │
  │  │  Preview (first 10 rows)                                  │  │
  │  │  ┌────┬──────────┬──────────┬──────────┬────────┬──────┐  │  │
  │  │  │ #  │ Name     │ Phone    │ Source   │ Assign │ Pri  │  │  │
  │  │  ├────┼──────────┼──────────┼──────────┼────────┼──────┤  │  │
  │  │  │ 1  │ Raj K.   │ 98765... │ Field V. │ Nipun  │ 3    │  │  │
  │  │  │ 2  │ Priya S. │ 98765... │ Field V. │ Mandeep│ 1    │  │  │
  │  │  │ 3  │ ⚠ Amit  │ 98765... │ Field V. │ ⚠ Unres│ 3    │  │  │
  │  │  │ ...│          │          │          │        │      │  │  │
  │  │  └────┴──────────┴──────────┴──────────┴────────┴──────┘  │  │
  │  └───────────────────────────────────────────────────────────┘  │
  │                                                                 │
  │  ☑ Skip duplicate phone numbers                                 │
  │  ☑ Skip rows with errors                                        │
  │                                                                 │
  │  [← Back to Mapping]              [Import 132 Leads →]          │
  └─────────────────────────────────────────────────────────────────┘
  ```
  ### 5.3 Validation Rules Applied Per Row
  For each row, run these checks in order:
  ```
  1. REQUIRED FIELDS:
     - name: must not be empty
     - phone: must be 10 digits after normalization
  2. PHONE VALIDATION:
     - Must be exactly 10 digits after stripping non-digits
     - Must start with 6, 7, 8, or 9
     - Check for duplicates against existing leads (phone + alternate_phone)
     - Check for duplicates within the file itself
  3. EMAIL VALIDATION (if present):
     - Must match basic email regex
     - Not required, just warn if invalid
  4. SOURCE VALIDATION:
     - If source column exists, try to normalize
     - If unrecognizable, warn and fall back to default
  5. ASSIGNMENT VALIDATION:
     - Try to resolve against profiles
     - If unresolved, warn and apply default rule
  6. PRIORITY VALIDATION:
     - If priority column exists, try to normalize
     - If unrecognizable, fall back to stage calculation
     - If no stage, default to 3
  7. DESIGNATION VALIDATION:
     - If designation column exists, try to match against
       control panel options
     - If no match, store as-is (it's free text in the CRM)
     - Determine if it's a professional designation for
       auto-professional creation
  ```
  ### 5.4 Duplicate Detection Details
  **Phone duplicate check (existing behavior, preserved):**
  ```
  For each row:
    1. Normalize phone to 10 digits
    2. Check against [leads.phone](http://leads.phone) and leads.alternate_phone
    3. Check against [customers.phone](http://customers.phone) and customers.alternate_phone
    4. Check against [professionals.phone](http://professionals.phone) and professionals.alternate_phone
    If match found:
      - Mark row as "duplicate"
      - Show which entity matched (lead/customer/professional)
      - Show the matched record's name and status
      - If "skip duplicates" is checked → skip this row
      - If unchecked → show warning but allow import
  ```
  **Intra-file duplicate check (new):**
  ```
  For each row:
    1. Check if this phone was already seen in a PREVIOUS row
       in the same file
    2. If yes → mark as "intra-file duplicate"
    3. Show: "Row 14: Phone matches Row 3 (Raj Kumar)"
    4. Both rows are still imported (they may be different people
      at different sites sharing a phone)
    5. But show a warning badge
  ```
  ### 5.5 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Add validation summary step |
  | `src/lib/bulkUploadValidator.ts` | CREATE | Per-row validation logic |
  | `src/components/leads/bulk-upload/ValidationSummary.tsx` | CREATE | Summary UI component |
  | `src/components/leads/bulk-upload/PreviewTable.tsx` | CREATE | Preview table component |
  ---
  ## Phase 6: Batch-Level Undo
  ### 6.1 Problem Statement
  If the user imports 145 leads and realizes the mapping was wrong, there's no way to undo. They'd have to manually find and delete each lead.
  ### 6.2 Implementation
  **Database:**
  The `import_batch_id` column added in Phase 2 enables batch undo.
  ```sql
  -- Already added in Phase 2 migration:
  ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS import_batch_id UUID,
  ADD COLUMN IF NOT EXISTS import_method TEXT DEFAULT NULL;
  ```
  **Undo logic:**
  ```typescript
  async function undoImportBatch(batchId: string): Promise<{
    deletedLeads: number;
    deletedProfessionals: number;
    deletedTasks: number;
  }> {
    // 1. Find all leads in this batch
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('import_batch_id', batchId);
    if (!leads || leads.length === 0) return { deletedLeads: 0, deletedProfessionals: 0, deletedTasks: 0 };
    const leadIds = [leads.map](http://leads.map)(l => [l.id](http://l.id));
    // 2. Delete tasks linked to these leads
    await supabase
      .from('tasks')
      .delete()
      .in('lead_id', leadIds);
    // 3. Delete lead_professionals links
    await supabase
      .from('lead_professionals')
      .delete()
      .in('lead_id', leadIds);
    // 4. Delete professionals created via this batch
    //    (only those with added_via_lead_id in this batch)
    const { data: batchPros } = await supabase
      .from('professionals')
      .select('id')
      .in('added_via_lead_id', leadIds);
    if (batchPros && batchPros.length > 0) {
      await supabase
        .from('professionals')
        .delete()
        .in('id', [batchPros.map](http://batchPros.map)(p => [p.id](http://p.id)));
    }
    // 5. Delete the leads
    await supabase
      .from('leads')
      .delete()
      .in('id', leadIds);
    return {
      deletedLeads: leadIds.length,
      deletedProfessionals: batchPros?.length || 0,
      deletedTasks: 0, // Calculated above
    };
  }
  ```
  ### 6.3 Undo UI
  After a successful import, show a toast with an "Undo" button:
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │  ✓ Import Complete                                              │
  │  132 leads imported, 4 professionals created, 132 tasks created │
  │                                                                 │
  │  [Undo Import]  (available for 24 hours)                        │
  └─────────────────────────────────────────────────────────────────┘
  ```
  The undo button:
  - Shows a confirmation dialog: `"This will delete 132 leads, 4 professionals, and 132 tasks created in this batch. This cannot be undone."`
  - Requires typing "UNDO" to confirm
  - After undo, shows a success toast
  ### 6.4 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/lib/bulkUploadUndo.ts` | CREATE | Batch undo logic |
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Add undo button after import |
  | Migration file | CREATE | Add `import_batch_id` and `import_method` columns |
  ---
  ## Phase 7: Import Progress & Resumability
  ### 7.1 Problem Statement
  For large files (200+ rows), the import can take 30+ seconds. If the browser crashes or the user navigates away, the import is lost.
  ### 7.2 Implementation
  **Progress tracking:**
  ```typescript
  interface ImportProgress {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    currentRow: number;
    phase: 'validating' | 'importing' | 'linking' | 'complete';
  }
  ```
  **Progress UI (shown during import):**
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │  Importing...                                                   │
  │                                                                 │
  │  ████████████████████░░░░░░░░  132 / 145                       │
  │                                                                 │
  │  ✓ Imported: 128                                                │
  │  ⊘ Skipped:  3 (duplicates)                                     │
  │  ✗ Failed:   1                                                   │
  │                                                                 │
  │  Current: Row 133 - "Priya Sharma"                              │
  │                                                                 │
  │  ⏱ Elapsed: 23s  |  Est. remaining: 8s                         │
  └─────────────────────────────────────────────────────────────────┘
  ```
  **Resumability:**
  For files with 100+ rows, save progress to `sessionStorage`:
  ```typescript
  const PROGRESS_KEY = `bulk_import_progress_${batchId}`;
  // Save after every 10 rows
  if (completed % 10 === 0) {
    sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({
      batchId,
      completedRow: currentRow,
      importedIds: importedIds,
      timestamp: [Date.now](http://Date.now)(),
    }));
  }
  // On page load, check for interrupted import
  const saved = sessionStorage.getItem(PROGRESS_KEY);
  if (saved) {
    const progress = JSON.parse(saved);
    // Show: "An import was interrupted at row 234. Resume?"
  }
  ```
  ### 7.3 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Add progress bar and resumability |
  ---
  ## Phase 8: Realtime & Performance
  ### 8.1 Realtime Channel for Bulk Import
  After a bulk import completes, invalidate the relevant React Query caches:
  ```typescript
  // After import completes:
  queryClient.invalidateQueries({ queryKey: ['leads'] });
  queryClient.invalidateQueries({ queryKey: ['professionals'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  ```
  ### 8.2 Batch Size for Database Inserts
  For files with 100+ rows, batch database inserts in groups of 50:
  ```typescript
  const BATCH_SIZE = 50;
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('leads')
      .insert(batch);
    if (error) throw error;
    // Update progress
    setProgress(prev => ({
      ...prev,
      completed: Math.min(i + BATCH_SIZE, validRows.length),
    }));
  }
  ```
  ### 8.3 Files to Create / Modify
  | File | Action | Description |
  |------|--------|-------------|
  | `src/components/leads/BulkUploadDialog.tsx` | MODIFY | Batch inserts, cache invalidation |
  ---
  ## Implementation Order
  ```
  Phase 1: Smart File Detection & Auto Column Mapping
      ↓
  Phase 2: Source Preservation & Smart Source Resolution
      ↓
  Phase 3: Assignment Resolution for Non-Standard Files
      ↓
  Phase 4: Priority Calculation in Bulk Upload
      ↓
  Phase 5: Validation Summary & Pre-Import Preview
      ↓
  Phase 6: Batch-Level Undo
      ↓
  Phase 7: Import Progress & Resumability
      ↓
  Phase 8: Realtime & Performance
  ```
  Phases 1-4 are the core workflow improvements. Phases 5-8 are quality-of-life and safety features. All phases are independent and can be implemented in any order, but the order above minimizes rework.
  ---
  ## Migration Files Needed
  | Migration | Description |
  |-----------|-------------|
  | `add_import_batch_columns.sql` | Add `import_batch_id` and `import_method` to `leads` |
  | `add_import_batch_to_professionals.sql` | Add `import_batch_id` to `professionals` |
  ---
  ## Testing Checklist
  - [ ] Upload standard template → auto-maps, no mapping UI shown
  - [ ] Upload file with 70% match → partial mapping UI with pre-fill
  - [ ] Upload file with 30% match → full mapping UI
  - [ ] Upload file with no source column → default source selector shown
  - [ ] Upload file with unrecognized source values → warning + fallback
  - [ ] Upload file with no assignment column → default assignment selector
  - [ ] Upload file with unrecognized staff names → fuzzy match + warning
  - [ ] Upload file with priority column → values normalized correctly
  - [ ] Upload file without priority → calculated from construction stage
  - [ ] Upload file with 100+ rows → progress bar shown
  - [ ] Import completes → undo button shown
  - [ ] Undo → all leads, professionals, tasks deleted
  - [ ] Duplicate phones within file → warning shown
  - [ ] Duplicate phones against existing DB → warning + skip option
  - [ ] Import completes → React Query caches invalidated
  - [ ] Large file (200+ rows) → batched inserts, no timeout
  ---
  *End of Phase 1-8 detailed plan. This document is designed to be appended to the existing plan document.*