# ADR-0002: Secure older customer files that were copied from leads

**Status:** Accepted
**Date:** 2026-10-28
**Deciders:** Nipun (owner)

## Context

Until PR #134, converting a lead to a customer copied the lead's attachment rows to the customer with the same storage path. After the encrypted-attachments release, the customer's Attachments tab lists only encrypted files, the one-time securing step handled only files under `customer/<customer id>/`, and a restrictive policy hides every `entity_type='customer'` row from signed-in users. Rows copied from leads were therefore invisible and never secured. Measured on 2026-10-28: none exist in production or preview, and no code creates new ones. The remaining risk is such rows returning, for example after restoring an old backup.

## Decision

When an admin opens a customer's Attachments tab, old customer rows that provably belong to a lead converted into that customer (the lead's own folder, or a lead photo the lead itself owns) are copied into the customer's encrypted storage and verified byte for byte, and then the customer's old row is retired. The lead's file and row are never changed. Everything else (import sheets, unlinked paths, other records' folders) is left alone. Up to 5 files are secured per call; the app repeats the call a few times and shows a short note if something is left.

## Options Considered

| Dimension | A. Extend the admin-open securing step (chosen) | B. New admin "secure all" action and button | C. Leave them on the lead, show nothing |
|-----------|------------------------------------------------|---------------------------------------------|----------------------------------------|
| Complexity | Low to medium | Medium to high | None |
| Cost | Small | Larger (new action, UI, tests) | None |
| Scalability | Fine for small counts, bounded per call | Best for large counts | Not applicable |
| Team familiarity | Reuses the proven legacy step | New surface | Not applicable |

- **A. Pros:** reuses the proven verify-then-retire logic; no new endpoint; no migration. **Cons:** lazy, it runs only when an admin opens the customer.
- **B. Pros:** explicit, one click. **Cons:** more surface to secure and test; not needed for zero rows.
- **C. Pros:** no work, no data lost (the files stay on the lead). **Cons:** breaks the rule that a lead's files go to the customer and become secured; the old copies stay invisible.

## Trade-off Analysis

Today's data is empty, so this is cheap, safe insurance rather than a rescue. Option A is the smallest change that completes the design without adding a new way to reach files. Copy-not-move keeps the lead whole, so a faulty run cannot harm the lead's files.

## Consequences

- **Easier:** restoring old data cannot silently hide files.
- **Harder:** one more path in the legacy step to test and maintain.
- **To revisit:** a bulk admin action if large numbers ever appear; old lead rows that point into `customer/` (none exist today).
