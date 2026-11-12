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
