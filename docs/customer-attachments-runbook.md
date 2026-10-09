# Customer attachments: runbook

Plain-English guide for the owner. It covers how secured customer files work and how to set them up, rotate the key and fix problems.

## 1. What this is

Files attached to a customer (identity documents, payment proof, site photos) are now **encrypted** before they are stored. Only the server function `customer-attachments` can lock and unlock them, using a secret key that is not in the code or the database.

- **Any employee** who can open a customer can upload a file for that customer. After uploading they cannot see, open or download it again.
- **Administrators**, and any role an administrator has given the permission "Manage Customer Attachments", can view, download, rename and delete the files.
- When a **lead is converted to a customer**, the lead's files are copied into the customer's secured files automatically. The originals stay on the lead.
- When a **customer is converted to a lead**, secured customer files are never copied to the lead.
- The same release also repairs file access for leads, tasks and professionals: staff can again upload and see files on records they have access to.

## 2. Before you start

You need to be signed in to the Supabase dashboard (supabase.com) and to know which project you are in:

- **PREVIEW** (test copy): project reference `wgffvhbzhexptvdraczc`, named "maharaja marble-preview".
- **PRODUCTION** (live company data): project reference `jmohlloabmddaiyjvahp`, named "Maharaja Marble -CRM".

Everything is done on PREVIEW first. Production is only touched after you have tested and said "final".

## 3. The encryption key

The key is a long random value. Anyone who has it AND access to the stored files can read them. **If it is lost, every secured file becomes permanently unreadable.**

How to create one (either way gives 44 characters ending in `=`):

- On a computer: `openssl rand -base64 32`
- On a phone: open the Supabase dashboard, SQL editor, run `select encode(gen_random_bytes(32), 'base64');` and copy the result. (If it complains that the function is unknown, use `extensions.gen_random_bytes(32)`.)

Rules:

1. Use a **throwaway key on PREVIEW**, and a **separate, new key on PRODUCTION**. Never reuse one for the other.
2. Keep the production key in **two safe places offline** (for example a password manager and a printed copy). It must never go into chat, e-mail, tickets, the code repository or screenshots.
3. Do not tell the key to anyone who does not need it, including AI assistants.

## 4. Secrets to set

In the Supabase dashboard of the right project: Edge Functions, then Secrets. Add exactly two secrets (names must match):

| Name | Value |
|---|---|
| `CUSTOMER_ATTACHMENTS_KEKS` | `{"1":"<your key>"}` (keep the quotes and braces; replace `<your key>` with the 44-character key) |
| `CUSTOMER_ATTACHMENTS_KEK_CURRENT` | `1` |

Do this separately for PREVIEW and for PRODUCTION, each with its own key. If a secret is missing or wrong, the function refuses to work (uploads fail with a generic error) instead of storing anything unprotected.

## 5. Order of operations

**Preview first, then production.**

Preview: apply the first migration, set the two secrets, deploy the function, test, then apply the second migration.

Production, in this exact order:

1. The architect takes a backup and tests that it can be restored.
2. Apply migration `20261007100000_secure_customer_attachments.sql` (adds the new tables and the private storage area; nothing existing changes).
3. Set the two secrets on the production project.
4. Deploy the function.
5. The owner merges the pull request.
6. Wait until the website deployment shows READY.
7. As an **administrator**, open the customer who has the old file and click the **Attachments** tab. The old file is secured automatically (it is copied, checked byte for byte, and only then removed from the old unprotected place).
8. The architect confirms that no old customer files remain.
9. Apply migration `20261007100500_fix_attachment_access_and_close_customer_paths.sql` (repairs lead, task and professional file access and closes the old customer file paths).
10. Verify, then run the clean-up checklist in section 11.

## 6. Giving a role permission to see files

Settings, Role Management, choose the role, Customers, tick **Manage Customer Attachments**, save. Administrators always have it. Nobody else has it unless you tick it.

## 7. Lead files copied at conversion

When a lead is converted to a customer, the app asks the function to copy the lead's files into the customer's secured files. The lead's own files are never changed or deleted.

A file is skipped (and stays on the lead) if it is larger than 10 MB, is not a PDF/JPG/PNG/WebP picture, cannot be found in storage, or cannot be read. The app shows a message saying how many files were copied and how many were not.

Copying is safe to repeat: files that were already copied are recognised and not copied twice. The conversion itself is never blocked or undone by a problem with files.

## 8. Rotating the key

Do this if the key may have leaked, or on a regular schedule. It does not touch the files themselves, only their small per-file keys.

1. Create a new key (section 3).
2. In the secret `CUSTOMER_ATTACHMENTS_KEKS` keep version 1 and add version 2: `{"1":"<old key>","2":"<new key>"}`.
3. Change `CUSTOMER_ATTACHMENTS_KEK_CURRENT` to `2`. New uploads now use the new key.
4. Run the `rewrap` action repeatedly until it reports `remaining` as 0. It needs a signed-in administrator session and there is no screen for it yet, so ask the architect.
5. Check that downloads still work.
6. Only then remove version 1 from the secret. Keep the old key offline for 30 days in case something was missed.

## 9. Backups and recovery

- The nightly database export includes the two new tables (the backup worker exports every public table). They hold only each file's name, size and **wrapped** key; wrapped keys are useless without the root key.
- The encrypted files themselves live in the storage area `customer-secure`. They are **not** part of the database backups.
- If the database is restored from a backup, files uploaded after that backup will have no record and cannot be opened.
- Keep the root key backed up offline (section 3). Without it, backups of everything else are still fine, but the secured files cannot be read.

You can see who did what with a SQL query in the dashboard: `select created_at, action, actor_name, customer_id from customer_attachment_access_log order by created_at desc limit 50;`

## 10. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Every upload fails with "Something went wrong" | The two secrets are missing or wrong on that project, or the function is not deployed | Check section 4 on the right project; check the function exists in Edge Functions; look at its logs for "key configuration invalid" |
| A manager sees "You do not have permission" | The role does not have Manage Customer Attachments | Section 6 |
| Downloads fail after a key change | Version 1 was removed before `rewrap` finished, or `KEK_CURRENT` points to a missing version | Put the old key back as version 1 in `CUSTOMER_ATTACHMENTS_KEKS`, finish `rewrap`, then remove it |
| An ordinary employee cannot see the files they uploaded | This is intentional | Only administrators and permitted roles can see secured files |
| Some lead files were not copied at conversion | Too large, wrong type, missing or unreadable file | Section 7; the files are still on the lead |
| The function answers with an error right after deploying | Deployment still starting, or secrets were set after deploying | Wait a minute and try again; if it persists, redeploy after setting the secrets |
| The old customer file is still in the old place | No administrator has opened that customer's Attachments tab yet | Open it as an administrator (section 5, step 7) |

## 11. Clean-up checklist after go-live

- No test files or test customers are left in production.
- The storage area `customer-secure` is private (no public access).
- No files remain under `customer/` in the storage area `crm-attachments`, and no `entity_attachments` rows with type `customer` remain.
- The secrets are not stored in the repository, in chat history, in tickets or in screenshots.
- No scratch files, test data or unused migration files are left in the repository.
- Old copies that are no longer needed (for example the temporary schema `crm_migration_backup_20260905`) are removed, after a final backup.

## 12. For developers

- The function is `supabase/functions/customer-attachments/`. All logic is in `handler.ts`; `index.ts` only connects the real services. `crypto.ts` and `validation.ts` have no imports.
- Run the automated tests with `deno test supabase/functions/customer-attachments/` (48 tests, no network, no real key).
- The request and response formats are below.

The function is called with `POST {SUPABASE_URL}/functions/v1/customer-attachments` and the signed-in user's login token. JSON requests send `{"action": "<name>", ...}`; `upload` sends `multipart/form-data` with the parts `action`, `customer_id` and `file`. Errors are always `{"error": "<code>"}` with the status 400 `invalid_request`, 401 `unauthorized`, 403 `forbidden`, 413 `file_too_large`, 415 `unsupported_type` or 500 `server_error`. A refused request always gets the same 403 whether or not the record exists.

| Action | Who may call it | Request | Success response |
|---|---|---|---|
| `upload` | anyone who can read the customer | form: `customer_id`, `file` (PDF, JPEG, PNG or WebP, up to 10 MB, checked by content) | `{id, file_name, file_size, mime_type}` |
| `list` | administrators and permitted roles (for administrators it first secures old unencrypted files of that customer) | `{customer_id}` | `{attachments: [{id, file_name, mime_type, file_size, uploaded_by_name, created_at, from_lead}]}`, newest first |
| `download` | administrators and permitted roles | `{attachment_id}` | the file's bytes, `Content-Type: application/octet-stream` |
| `rename` | administrators and permitted roles | `{attachment_id, file_name}` | `{id, file_name}` |
| `delete` | administrators and permitted roles | `{attachment_id}` | `{id}` |
| `rewrap` | administrators | `{limit?}` (1 to 500, default 200) | `{rewrapped, remaining}` |
| `import_lead_files` | anyone who can read both the lead and the customer, and only when the lead is recorded as converted to that customer | `{lead_id, customer_id, offset?}` | `{imported, already_imported, skipped: [{file_name, reason}], next_offset}`; call again with `offset = next_offset` until it is `null` (8 files per call) |
