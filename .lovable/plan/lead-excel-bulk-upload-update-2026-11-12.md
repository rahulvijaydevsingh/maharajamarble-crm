# Lead Excel Bulk Upload update

## Verified intent

- Excel imports must save the canonical option values that the Lead form expects, even when a spreadsheet uses the human-readable labels.
- An `Initial Note` must be retained as the lead note.
- `Alternate Phone` must appear in the template, be detected automatically, and save as a 10-digit alternate number.
- Staff assignment values remain full staff names; no UUID or email is saved.

## Implementation

1. Centralize label/value matching for source and construction-stage options in the existing upload resolver, with case-insensitive matching and snake-case fallback.
2. Use that matching during Excel row validation, preserving valid custom live settings and warning only when a non-empty value cannot be matched.
3. Keep the template and auto-detection aligned for `Initial Note` and `Alternate Phone`, and preserve the validated values in the insert payload.
4. Add focused tests for label matching, snake-case fallback, `Initial Note`, and 10-digit alternate-phone detection.

## Scope

- Change only `BulkUploadDialog.tsx`, `bulkUploadColumnDetector.ts`, and a focused resolver/test file if needed for safe test coverage.
- Do not change permissions, unrelated CRM logic, lockfiles, or `.gitignore`.  
  
  
Approved! Please proceed with this plan, with three small additions to make sure there are no edge cases:
  1. **Apply Canonical Value Normalization to All Dropdown Columns:** In addition to `source` and `construction_stage`, apply the same case-insensitive label-to-value matching `getFieldOptions` match + `snake_case` fallback) to `status`, `priority`, `designation`, and comma-separated `material_interests` so no dropdown renders blank on edit when a display label is entered in Excel.
  2. **Phone Normalization on `Alternate Phone`:** Normalize `Alternate Phone` using the same 10-digit Indian phone stripping logic as primary `phone` (stripping `+91`, leading `0`, spaces, and dashes), while allowing blank cells to save cleanly as `null` without triggering a validation warning.
  3. **TypeScript Check:** Run `npx tsc --noEmit -p tsconfig.app.json` after implementing to verify zero type errors.