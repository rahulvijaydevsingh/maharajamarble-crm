# Reliable professional profile resolution

## What will change
- Create one shared professional-resolution helper that both task creation and task summaries use.
- Resolve in a safe, fixed order: an explicit lead profile link, then a primary lead-professional link, then only for professional-designated leads an exact normalized phone match.
- Replace the two capped 50-record professional scans with targeted phone lookups, so matching profiles are found regardless of database size.
- Preserve every existing lead/task relationship and keep non-professional leads fully isolated from phone matching.

## Validation
- Add focused tests for records beyond 50, formatted and alternate phones, empty/short phones, duplicates, and homeowner isolation.
- Run the complete Vitest suite and the TypeScript check after implementation.

## Technical details
- Only the shared resolver, the two existing callers, and focused resolver tests will change.
- No database, permission, audit-field, lockfile, or modal-layer changes are required.
