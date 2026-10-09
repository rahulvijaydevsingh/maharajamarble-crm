# ADR-0001: Encrypt customer attachments at the application layer

**Status:** Proposed
**Date:** 2026-10-07
**Deciders:** Nipun (owner); architect review

## Context

Customer attachments (identity documents, payment proof, site photos) are sensitive. The requirement is that they stay unusable even to someone who reaches the database or the storage bucket directly — for example through a leaked service-role key, dashboard access, or any tool that holds project credentials.

Today files live in the private bucket `crm-attachments` and are protected by row-level-security policies. Those policies apply only to requests made with a normal user session; a service-role key or dashboard access bypasses them. Supabase's encryption at rest protects the physical disks, not someone holding valid credentials. All uploads currently go from the browser straight to storage; the project has no upload edge function.

Permission model chosen by the owner: any employee with access to a customer can upload for that customer; viewing, renaming and deleting require admin permission, which an admin can delegate to a role.

Conversion rules chosen by the owner: when a lead is converted to a customer, the lead's files go to the customer and become secured. When a customer is converted to a lead, the customer's secured files are never copied to the lead. If that lead is converted again, the files uploaded to it in the meantime are added to the customer and become secured.

Constraints: a small team, no external key-management service, Supabase Edge Functions (Deno) already in use, very little existing data (one customer file), limited operational capacity.

## Decision

Encrypt each file inside a Supabase Edge Function with AES-256-GCM using a random per-file key. Wrap that key with a root key that exists only as an Edge Function secret, and store the wrapped key in the database. Keep ciphertext in a dedicated private bucket that no client can access. All reads and writes go through the function, which enforces the permission rules and writes an access log.

When a lead is converted to a customer, the same function copies the lead's files into the secure store (action `import_lead_files`). The lead's original files are left in place. Secured customer files are never copied to a lead.

## Options Considered

### Option A: Envelope encryption in an Edge Function (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — one new function, the first non-direct upload flow |
| Protection against bucket/database access | High — only ciphertext is stored; the key sits in a separate configuration surface |
| Key rotation | Cheap — re-wrap small per-file keys, no file re-encryption |
| Cost | No extra services |
| Team familiarity | Medium — functions are already used; the cryptography is new |

**Pros:** meets the stated threat model; central place for validation, permissions and audit; rotation is practical.
**Cons:** key custody becomes a real responsibility; the function becomes a critical path.

### Option B: Client-side encryption with a shared key

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Protection against bucket/database access | Low — the key must reach the browser, so it is not secret |
| Key rotation | Hard |
| Cost | None |
| Team familiarity | High |

**Pros:** simple to build.
**Cons:** anyone who can read the bucket can usually read the client code; fails the requirement.

### Option C: Password-protected PDF/ZIP files

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Protection against bucket/database access | Low to medium — format-dependent and often crackable |
| Key rotation | Manual |
| Cost | None |
| Team familiarity | High |

**Pros:** familiar concept.
**Cons:** images need wrapping in an archive; weak protection for PDFs; passwords must be shared and managed by hand.

### Option D: Row-level security and Supabase encryption at rest only

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Protection against bucket/database access | None beyond today |
| Key rotation | Not applicable |
| Cost | None |
| Team familiarity | High |

**Pros:** nothing to build.
**Cons:** does not meet the requirement; bypassed by the service role or the dashboard.

## Trade-off Analysis

Options B, C and D are cheaper but none keeps files unreadable once someone has bucket or database access. Option A is the only one that does, at the price of owning a key. That cost is acceptable here: the data volume is tiny, the function is small, and the per-file key design keeps rotation inexpensive.

## Consequences

- Raw bucket or database access becomes useless without the root key.
- Every access is logged centrally, and file validation (type, signature, size) is enforced on the server instead of only in the browser.
- Losing the root key makes every file permanently unrecoverable. It must be backed up offline.
- Stored objects are not part of the automated database backups. The metadata table is exported with the database (the backup worker discovers every public table); wrapped keys in it are useless without the root key.
- Deleting a customer removes its metadata; the unreadable ciphertext objects can remain until swept.
- A compromised admin session, or leaked Edge Function secrets together with bucket access, still exposes files. This design does not defend against that.
- Files are processed in memory, so uploads are capped at 10 MB.
- Lead files copied at conversion exist twice: encrypted on the customer and, unchanged, on the lead. Anyone who can open that lead can still open the original. If the owner wants the originals removed after copying, a "move" option can be added later.
- The shared attachment access rules for leads, tasks and professionals were corrected in the same release (migration `20261007100500`). Attachments are now accessible when the caller is an admin or can see the parent record; before this, uploads to lead, customer and professional folders were rejected for everyone and non-admin staff could not see attachments on their own records.

## Action Items

1. [ ] Generate the root key and store it offline; set the two secrets (see the runbook).
2. [ ] Apply migration 1, set the secrets, deploy the function, merge, then open the customer that has the old file as an admin (it is secured automatically), then apply migration 2.
3. [ ] Later: sweep orphaned ciphertext objects; add a viewer for the access log; add an admin screen for key rotation (`rewrap`); consider other entity types; consider a "move" option for lead files.
