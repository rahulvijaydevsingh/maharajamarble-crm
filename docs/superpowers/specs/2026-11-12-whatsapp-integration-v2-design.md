# WhatsApp Integration — Fortified v2 Technical Specification

Maharaja Marble CRM · Approved v2.1 · 2026-11-12 · Authors: Claude & Gemini (Lead Architects) · Decider: Nipun Tantia

## 0. Document control and how to read this

| Item | Value |
| --- | --- |
| Project | WhatsApp messaging for the CRM (repo rahulvijaydevsingh/maharajamarble-crm; main checked at 4ce436d on 2026-11-10 [V]) |
| Status | Approved for Slice 0–1D build on single incremental branch `feat/whatsapp-integration-v2`. |
| Process | Architectural path: design approved in chat 2026-11-12 with CTO overrides → this written spec → owner approval → slice-by-slice commits on single PR → Preview verification → Production cutover |
| Tags | [V] verified in code, live data or documentation (source named) · [stated] told by Nipun or the CTO · [U] not verified, or a heuristic · Default = a value chosen here that the owner confirmed |
| Committed path | `docs/superpowers/specs/2026-11-12-whatsapp-integration-v2-design.md` |
| Slices | 0 Hardening and schema · 1A Company session and single send · 1B Media · 1C Bulk, rails and STOP · 1D Staff sessions · Phases 2 and 3 are designed here and built later (section 15) |

## 1. Purpose, scope and success criteria

### 1.1 Purpose

Let staff send WhatsApp messages from the CRM to their own leads, customers and professionals (quotation PDFs, catalogues, material images, location pins and text, singly or in batches of up to 100), with every send recorded under the staff member’s full name, replies captured, STOP requests honoured, and no re-architecture between phases. Extra infrastructure cost: $0.

### 1.2 Active in Phase 1 (slices 0 to 1D)

- Two company session slots (main, bulk) and optional per-staff sessions, paired by QR from the CRM.
- Single sends from the CRM, the quotation dialog and entity profiles; bulk sends of up to 100 recipients with server-side placeholders and a mandatory preview.
- Media: short-lived quotation PDFs, a reusable catalogue and image library, location pins (showroom, site, custom).
- Pacing, daily caps, business hours, warm-up, kill switch and automatic safety pause.
- Inbound listener on company sessions; Stage 1 opt-out (STOP, UNSUBSCRIBE); inbound logging for known contacts; delivery and read receipts.
- Attribution by staff full name in the message log and the activity log (INVARIANT-04).
- Admin screens for slots, permissions, library, rails and status.

### 1.3 Designed now, switched on later (schema and hooks exist; flags default off)

Stage 2 keyword auto-reply · Stage 3 inbound lead pool · KIT touch completion · automation-rule sends · number check before bulk · interactive buttons and lists · live inbox · Meta Cloud API provider.

### 1.4 Out of scope

Group chats, status and stories, calls, payments, the WhatsApp Business catalogue API, the sticker, label and bot-command features of WA-AKG, more than one worker per environment, and building the Cloud API provider (only its seam is built).

### 1.5 Success criteria

| ID | Criterion | How it is tested |
| --- | --- | --- |
| S1 | A permitted staff member sends one text or PDF and it reaches sent within 20 s of confirming, when the worker is online and the rails allow [U target] | Preview with a test SIM; timestamp difference |
| S2 | The QR appears within 5 s of pressing Connect [U target] | Preview; 10 attempts timed |
| S3 | Zero duplicate sends under race, crash and restart | 3 concurrent claimers; kill -9 during a send; each queue row ends with one provider message id or needs_review |
| S4 | A 100-recipient campaign paces every gap within 15 to 35 s and halts within 5 s of the kill switch | Fake-socket simulation, then a live run of 10 recipients |
| S5 | Every outbound and system row stores a staff full name or an approved sentinel in sent_by; no UUIDs or e-mails | SQL assertion after every test run |
| S6 | STOP or UNSUBSCRIBE blocks every later send to that phone within 10 s, across leads, customers and professionals | Live test with a test SIM; the queue row becomes skipped_opt_out |
| S7 | The worker uses at most 40% of the 500,000 monthly edge invocations, opens 0 database connections, and WhatsApp storage stays under 350 MB | Usage counters (section 13) |
| S8 | A message from a number that is not a CRM contact never leaves a personal session | Live test; spool and logs inspected |
| S9 | No WhatsApp edge function can be deployed without an explicit verify_jwt entry | CI test reads supabase/config.toml |

## 2. Constraints and invariants

| Area | Constraint |
| --- | --- |
| Cost | $0 extra infrastructure. Shared cPanel (`maharwfy@maharajamarble.com`) failed Spike S2 (`node` missing, 800 MB RAM limit, `25` max processes, `100` max open files) [V]. The worker runs on an Office Windows PC or an Always-Free Linux VPS (section 9.9) [stated] |
| Supabase plan | Both projects are on the Free plan [stated]: database 500 MB, file storage 1 GB, egress 5 GB, 500,000 edge invocations a month, Realtime 2 million messages and 200 peak connections, edge wall-clock 150 s, 60 direct database connections [V: Appendix A and production max_connections] |
| Deploy path | GitHub main deploys to production through Vercel, which runs only vite build and never tsc. Lovable pushes to main and redeploys edge functions; a function with no config.toml entry is deployed with verify_jwt off [stated, handover] |
| Workflow | Single incremental PR (`feat/whatsapp-integration-v2`) built and verified slice-by-slice on Preview (`wgffvhbzhexptvdraczc`) before squash-merging to `main`. |
| Production | Read-only until Nipun approves the exact action. No secrets in prompts, chats or this document. Storage objects are deleted only through the Storage API, never with SQL [stated] |
| INVARIANT-01 | No ellipses or placeholder comments in any code or SQL produced from this spec |
| INVARIANT-02 | Keep the gold #C9A84C and navy #1A1A2E tokens, the Tailwind baseline and every lockfile |
| INVARIANT-04 | assigned_to, created_by, updated_by, sent_by and every other attribution column store a staff full name or an approved sentinel (section 7.1), never a UUID or e-mail |
| Realtime | Every new postgres_changes subscription goes through src/lib/realtimeRegistry.ts [V], because adding callbacks after subscribe() caused earlier outages [stated] |
| Runtime | Node 20 or newer (Baileys engines field) [V] |

## 3. Verified baseline

| ID | Fact | Source |
| --- | --- | --- |
| B1 | CRM main is at 4ce436d (2026-11-10). | [V] git |
| B2 | Production and Preview each hold 4 whatsapp_* tables. Rows: settings 1, sessions 0, messages 0, queue 0. On production module_enabled is false and no gateway URL is set. | [V] SQL on both |
| B3 | The 4 dormant functions are live on production (version 21) with verify_jwt off. whatsapp-process-queue and whatsapp-session-status have no login check. All four call Evolution API (EVOLUTION_API_KEY, /instance/create, /message/sendText), not WA-AKG. | [V] list_edge_functions, code |
| B4 | The dormant queue code has no row lock and no pause between sends (up to 10 per run). The bulk dialog sets a fixed delay (default 10 s) in the browser and inserts straight into the queue. | [V] code |
| B5 | whatsapp_queue INSERT is open to any logged-in user; whatsapp_settings SELECT is open to every role; whatsapp_sessions INSERT and UPDATE are open to the row owner; whatsapp_messages.sent_by is a uuid and its policy compares it with auth.uid(). | [V] pg_policies and information_schema |
| B6 | is_admin() checks user_roles for admin or super_admin. is_assigned_to_me(text) matches profiles.full_name or email. get_current_user_full_name() falls back to the e-mail when the profile has no name. | [V] pg_proc |
| B7 | No SQL phone normalizer exists; normalizers are copied inline in at least 6 components. | [V] pg_proc, repo grep |
| B8 | Name and phone fields: leads (name, phone, alternate_phone, firm_name, site_location, site_plus_code, assigned_to, additional_contacts); customers (name, phone, alternate_phone, company_name, site_plus_code, assigned_to, additional_contacts; no site_location); professionals (name, phone, alternate_phone, firm_name, site_plus_code, assigned_to). | [V] information_schema |
| B9 | activity_log has lead_id, customer_id, activity_type, activity_category (communication exists), user_id (text), user_name, related_entity_type, related_entity_id, metadata. notifications.user_id holds uuid-shaped text. app_role values: super_admin, admin, manager, sales_user, sales_viewer, field_agent. | [V] SQL |
| B10 | crm-attachments is private with no size or type limit. Its policies allow only the prefixes imports, lead-photos, lead/ and quotations/, so new prefixes are denied until policies are added. | [V] storage.buckets, pg_policies, storage.objects |
| B11 | Production database is 67 MB; max_connections 60 with 15 in use at the check. Production file storage is 99.56 MB of 1 GB. | [V] SQL; [stated] handover, CTO |
| B12 | supabase/config.toml has 5 function entries (all verify_jwt = true); the repo has 28 function folders. | [V] repo |
| B13 | plusCode.ts exports only an encoder (coordinatesToPlusCode, 10 digits by default) and EXIF GPS extraction; there is no decoder. quotationPdf.ts exports only downloadQuotationPdf, which triggers a browser download. The PDF library is jspdf 4.2.x. | [V] repo |
| B14 | src/lib/realtimeRegistry.ts exists and is used by Sidebar, the lead and customer profile tabs and useReminders. | [V] repo |
| B15 | tsconfig.app.json includes only src; the repo root has no services folder; docs/adr holds 0001 and 0002. | [V] repo |
| B16 | WA-AKG at 04d6c0f (2026-11-02): MIT licence; Prisma provider mysql; about 34,000 lines in 221 files; Next.js dashboard; Baileys pinned at 7.0.0-rc14; telemetry beacon every 30 s to the author’s server in src/server/index.ts; syncFullHistory true; markOnlineOnConnect defaults to true; key writes swallow errors and run one query per key; auth state encrypted with AES-256-GCM. | [V] code |
| B17 | Module coupling (lines / lines mentioning prisma): chat.service 520 / 9; interactive 882 / 0; antispam 251 / 2; store/autoreply 202 / 4; jid-utils 174 / 4; instance 291 / 10; manager 172 / 8. | [V] grep |
| B18 | Baileys on npm: latest is 7.0.0-rc14, legacy is 6.7.24; both need Node 20 or newer. rc14 takes every dependency from the npm registry, including whatsapp-rust-bridge 0.5.4, which is Rust compiled to WebAssembly (5 files, nothing to build). | [V] npm view, npm pack |
| B19 | Supabase Free quotas: database 500 MB, storage 1 GB, egress 5 GB, 500,000 edge invocations, Realtime 2 million messages and 200 peak connections; edge wall-clock limit 150 s. | [V] Appendix A |
| B20 | WhatsApp’s terms and messaging guidelines prohibit bulk and automated messaging and list unofficial clients among prohibited tools. | [V] Appendix A |
| B21 | cPanel terminal diagnostic (`maharwfy@maharajamarble.com`): `node`/`npm` missing, 800 MB RAM limit, `nproc` = 25, `nofile` = 100. Shared cPanel is NO-GO as-is. | [V] cPanel diagnostic |

## 4. Where this spec differs from, or adds to, the CTO notes

| # | CTO note | This spec | Evidence |
| --- | --- | --- | --- |
| 1 | Pin Baileys to a stable version that needs no native or Rust compilation | Pin 7.0.0-rc14 exactly and bundle it in CI; keep 6.7.24 as the documented fallback | The Rust piece is WebAssembly, so no compiler is needed; 6.7.24 installs libsignal from a moving git URL [V] B18 |
| 2 | Preserve chat.service.ts | Preserve its behaviours; remove wa-sticker-formatter and use jimp only for image thumbnails | chat.service imports wa-sticker-formatter [V] B17 |
| 3 | Telemetry ping is in src/lib/github.ts | The beacon is in src/server/index.ts (every 30 s to the author’s server); neither it nor any update check is vendored; CI fails the build if their hosts appear | [V] B16 |
| 4 | Forward new incoming messages from the connected number | Company sessions forward every 1:1 message. Personal sessions forward content only after a hash probe confirms the sender is a CRM contact. Groups, status and newsletters are never forwarded | Prevents personal chats from streaming into the CRM |
| 5 | Mark whatsapp_opt_out on the matching lead, customer or professional | A phone-keyed suppression table (`whatsapp_suppressions`) is the authority; the entity flags are mirrors | Covers leads created later with the same phone |
| 6 | Worker subscribes to a Realtime channel | Realtime is only a doorbell and its payload is untrusted; all work is pulled through the authenticated sync call | Publishable key ships in browser bundle |
| 7 | Keep the auto-reply store in the gateway and a keyword hook in the router | One brain: rules live in the CRM. The gateway’s auto-reply module and interactive.ts stay in the codebase but are disabled by flags | Prevents double-replies |
| 8 | Earlier plan: wa_gateway Postgres schema | Not used. Baileys credentials live in AES-256-GCM encrypted files on the worker host (Windows NTFS & Linux POSIX compatible) | Keeps session keys out of Supabase backups and the Preview mirror |
| 9 | Migrate sent_by to TEXT and add sent_by_user_id | Adopted. The three tables are empty, so they are replaced, guarded by a row-count check. The *_user_id columns are authorization keys, not attribution | [V] B2, B5 |
| 10 | verify_jwt = true and X-Worker-Secret | Adopted, plus a CI test and strict `REVOKE EXECUTE` on `SECURITY DEFINER` RPCs | Closes direct PostgREST RPC bypass |
| 11 | Staff name from the profile | Enqueue refuses when profiles.full_name is empty and never uses the e-mail fallback of get_current_user_full_name() | [V] B6 |
| 12 | Realtime plus fallback poll | Adaptive polling: 60 s with a healthy doorbell, 30 s without, 10 s while pairing or sending, 120 s when no session is connected or wanted | 500,000 invocations a month [V] B19 |
| 13 | Dual slots main and bulk | Adopted. The main slot gets tighter caps and no bulk path; the Cloud API seam stays open | [V] B20 |
| 14 | Quotation PDF from quotationPdf.ts | Add buildQuotationPdf returning a Blob; downloadQuotationPdf calls it | [V] B13 |
| 15 | {{site_map_link}} from the Plus Code | Formats the stored full `site_plus_code` as `[https://www.google.com/maps/search/?api=1&query=](https://www.google.com/maps/search/?api=1&query=)<encodeURIComponent(site_plus_code)>`. `decodePlusCode` is added for native location pins | [V] B13 |

## 5. Architecture

### 5.1 Principles

1. **No inbound port.** The worker starts every connection (WhatsApp, Supabase HTTPS, Supabase Realtime). Nothing on the host is reachable from the internet.
2. **The CRM database decides.** Queue, rails, permissions and suppressions live in Postgres; the worker only executes.
3. **The worker is replaceable.** Its only irreplaceable state is the WhatsApp credentials; losing them costs one QR scan.
4. **Rails twice.** Caps, hours, gaps and suppressions are enforced in the database at claim time and again in the worker.
5. **No secrets in the database or the browser.**
6. **At most once.** A send whose outcome is unknown is never retried automatically; it becomes needs_review.
7. **Privacy by design.** Personal sessions forward only CRM contacts; message bodies are redacted after a retention period.
8. **Design once, switch on in phases.** Later phases are flags, not migrations.
9. **Free-plan budgets are requirements** (S7).

### 5.2 Components

- **CRM web app (React, Vercel):** Staff browsers; talks to Supabase with user JWT (`whatsapp-enqueue`, `whatsapp-session`, Storage uploads, read views).
- **Postgres (Supabase):** Queue, rails, permissions, logs, suppressions; never WhatsApp credentials.
- **Edge functions (Supabase):** `whatsapp-enqueue`, `whatsapp-session`, `whatsapp-worker`, `whatsapp-inbound`, `whatsapp-watchdog`.
- **Storage (Supabase):** `crm-attachments/whatsapp-staging` and `whatsapp-library`.
- **Realtime (Supabase):** Doorbell broadcasts (`wa-gateway-production`, `wa-gateway-preview`) and Postgres Changes for UI rows.
- **Gateway worker (Office Windows PC or Linux VPS):** Encrypted WhatsApp credentials, media cache, event spool, logs, `WA_WORKER_SECRET`, `WA_AUTH_ENC_KEY`.

### 5.3 Secrets and trust boundaries

- `WA_WORKER_SECRET` & `WA_WORKER_SECRET_NEXT`: Supabase function secrets & worker env.
- `WA_PREVIEW_SECRET`: Supabase function secrets only.
- `WA_WATCHDOG_SECRET`: Supabase function secrets & GitHub Actions secrets.
- `WA_PROBE_SALT`: Supabase function secrets; returned to worker by `hello`.
- `WA_AUTH_ENC_KEY`: 32 random bytes (base64) in worker environment only.

### 5.4 Flows

- **F1 Connect (QR):** Connect action → `whatsapp-session` sets `desired_state = 'connected'`, `status = 'pairing_requested'` → doorbell → worker syncs in ~1 s → QR stored in `qr_payload` → Realtime updates UI modal → on scan `status = 'connected'`, `qr_payload = null`, `warmup_started_at = COALESCE(warmup_started_at, now())`.
- **F2 Single send & F3 Bulk:** Preview (`preview_token` HMAC) → Commit → `wa_create_campaign` → doorbell → worker claims via `wa_claim_next` → waits 15–35 s random pace → sends → reports via `wa_report_result`.
- **F4 Quotation PDF:** `buildQuotationPdf` Blob → upload to `whatsapp-staging/<uid>/<uuid>/<quote>.pdf` → 15-min signed URL at claim → janitor deletes via Storage API once final or after 24 h.
- **F5 Inbound & F6 Opt-out:** `messages.upsert` (1:1 only, `syncFullHistory: false`) → privacy probe on personal sessions → `whatsapp-inbound` → Stage 0 auth/dedupe → Stage 1 `STOP`/`UNSUBSCRIBE` (`wa_apply_opt_out` + confirmation send) → Stage 3 known-contact log / pool → Stage 2 auto-reply.
- **F7 Janitor:** Runs every 10 minutes via `whatsapp-worker` (`janitor` action); deletes released/24h staging files via Storage API, reconciles flags, and purges expired rows.
- **F8 Kill switch & F9 Restart/crash:** `kill_switch` stops `wa_claim_next` immediately; `wa_expire_leases` moves expired `sending` rows to `needs_review`.

## 6. Architecture decision records (Summary)

- **ADR-0003 (Number and slot strategy):** Dual company slots (`main` for 1:1, `bulk` for batches up to 100 on a secondary SIM, optional `allow_shared_slots` for testing behind a red warning) plus 1:1 `personal` sessions.
- **ADR-0004 (Vendored WA-AKG modules behind ports):** Vendor `chat.service.ts`, `interactive.ts`, `antispam.ts`, `store/autoreply.ts`, and `jid-utils.ts` into `services/wa-gateway/vendor/wa-akg` (commit `04d6c0f`, MIT), replacing Prisma calls with TypeScript ports.
- **ADR-0005 (Worker and CRM transport):** Outbound-only worker with Realtime broadcast doorbell + adaptive HTTPS polling (`whatsapp-worker`, `whatsapp-inbound`).
- **ADR-0006 (Baileys version and install method):** Pin `@whiskeysockets/baileys` at `7.0.0-rc14` (WASM bridge, zero native compiler required) with `jimp` for thumbnails and `esbuild` bundling.
- **ADR-0007 (WhatsApp credential storage):** Local AES-256-GCM encrypted files (`data/auth/<session_key>`) with 12-byte random IV and atomic temp-file rename (Windows NTFS and Linux POSIX safe).
- **ADR-0008 (Media and storage protection):** `whatsapp-staging/` (100 MB quota, 24h max lifetime, Storage-API-only deletion) and `whatsapp-library/` (250 MB quota, 500 MB local worker cache by SHA-256).
- **ADR-0009 (Inbound pipeline, suppression and privacy):** `whatsapp_suppressions` keyed by `phone10` is authoritative; entity `whatsapp_opt_out` columns are mirrors; personal sessions probe `sha256(WA_PROBE_SALT + ":" + phone10)` before forwarding.
- **ADR-0010 (Host-agnostic Windows & Linux worker runtime):** Shared cPanel is NO-GO (`nproc=25`, `nofile=100`, no Node.js). Worker targets Office Windows PC or Linux VPS using cross-platform `node:path` and NTFS-safe atomic file operations.

## 7. Data model & security rules

Implemented verbatim in `supabase/migrations/20261112100000_whatsapp_v2_foundation_m0.sql`:
- **Tables (13):** `whatsapp_settings`, `whatsapp_sessions`, `whatsapp_user_permissions`, `whatsapp_campaigns`, `whatsapp_queue`, `whatsapp_messages`, `whatsapp_suppressions`, `whatsapp_inbound_pool`, `whatsapp_auto_replies`, `whatsapp_auto_reply_log`, `whatsapp_library_items`, `whatsapp_worker_instances`, `whatsapp_events`.
- **Views (2):** `whatsapp_settings_public`, `whatsapp_campaign_progress`.
- **Functions & RPCs (17):** `normalize_phone_10`, `wa_is_valid_attribution_name`, `wa_current_user_name`, `wa_can`, `wa_phone_suppressed`, `wa_match_entities` (with `COALESCE(is_deleted, false) = false` filter), `wa_slot_status`, `wa_create_campaign`, `wa_expire_leases`, `wa_claim_next`, `wa_report_result`, `wa_apply_opt_out`, `wa_cancel_item`, `wa_cancel_campaign`, `wa_library_register`, `wa_reconcile_flags`, `wa_erase_contact`.
- **Function Execution Privileges:** All 17 functions revoke `EXECUTE` from `PUBLIC` and `anon`. Control-plane functions (`wa_phone_suppressed`, `wa_match_entities`, `wa_create_campaign`, `wa_expire_leases`, `wa_claim_next`, `wa_report_result`, `wa_apply_opt_out`, `wa_reconcile_flags`) revoke `EXECUTE` from `authenticated` and grant strictly to `service_role`.
- **Backup Exclusions:** `crm-backup-worker` excludes high-churn operational tables (`whatsapp_events`, `whatsapp_worker_instances`, `whatsapp_queue`) from daily ZIP archives to preserve the 1 GB Free-Tier storage quota.

## 8–18. Edge functions, Gateway Worker, CRM UI, Rails, Testing & Appendices

- **Edge Functions (`supabase/functions/`):** `whatsapp-enqueue` (`verify_jwt = true`), `whatsapp-session` (`verify_jwt = true`), `whatsapp-worker` (`verify_jwt = false`, constant-time `X-Worker-Secret` + 5-min timestamp window), `whatsapp-inbound` (`verify_jwt = false`, constant-time `X-Worker-Secret`), `whatsapp-watchdog` (`verify_jwt = false`, `X-Watchdog-Secret`).
- **Placeholders (Server-side single-pass `{{key|fallback}}`):** `name`, `firm_name`, `site_location`, `site_map_link` (`[https://www.google.com/maps/search/?api=1&query=](https://www.google.com/maps/search/?api=1&query=)<encodeURIComponent(site_plus_code)>`), `assigned_to`, `showroom_name`, `showroom_map_link`, `quotation_number`, `quotation_total`, `valid_until`.
- **Sending Rails (Defaults):** Pace 15–35 s random + 60–180 s rest every 10–15 sends; business hours 09:30–18:30 IST (bulk only); daily total caps: main 60, bulk 100, personal 40; new-recipient daily caps: main 25, bulk 30, personal 15 (warm-up: days 1–3 = 10, days 4–7 = 20, days 8–14 = 30); auto safety pause after 3 consecutive failures.
- **Appendix B Phone Vectors:** 14 canonical test vectors enforced identically in `public.normalize_phone_10(text)` and `src/lib/phone.ts`.
