// Request handler for the `customer-attachments` Edge Function.
//
// All logic lives here, behind a small `Deps` interface, so that it can be tested with fake backends.
// `index.ts` only wires in the real ones. The request and response formats are listed in section 12 of
// docs/customer-attachments-runbook.md.
//
// Security rules implemented here:
//  - every permission decision is made with the CALLER'S OWN session (the user client);
//  - the service-role client is used only for storage and for the tables that clients must never touch;
//  - a failed permission always answers the same 403, whether or not the record exists;
//  - nothing sensitive is ever returned or logged (no keys, storage paths, file contents or file names).

import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  buildAad,
  decryptFile,
  encryptFile,
  generateDek,
  type Keks,
  loadKeks,
  rewrapDek,
  unwrapDek,
  wrapDek,
} from "./crypto.ts";
import { detectMimeType, MAX_FILE_BYTES, sanitizeFileName } from "./validation.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export interface Deps {
  createUserClient: (req: Request) => Db;
  createAdminClient: () => Db;
  getEnv: (name: string) => string | undefined;
  newId: () => string;
}

const SECURE_BUCKET = "customer-secure";
const LEGACY_BUCKET = "crm-attachments";
const IMPORT_BATCH = 8;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

const invalidRequest = () => new HttpError(400, "invalid_request");
const serverError = () => new HttpError(500, "server_error");

interface Ctx {
  deps: Deps;
  userClient: Db;
  admin: Db;
  userId: string;
  actorName: string | null;
  keks: Keks | null;
}

type Parsed = { action: string; json: Row | null; form: FormData | null };

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw invalidRequest();

    // Cheap checks first: a request that cannot be valid is refused before anything is read.
    if (!/^Bearer\s+\S+/i.test(req.headers.get("Authorization") ?? "")) throw new HttpError(401, "unauthorized");
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw new HttpError(413, "file_too_large");

    const userClient = deps.createUserClient(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user?.id) throw new HttpError(401, "unauthorized");

    const parsed = await parseBody(req);
    const ctx: Ctx = {
      deps,
      userClient,
      admin: deps.createAdminClient(),
      userId: user.id,
      actorName: null,
      keks: null,
    };

    switch (parsed.action) {
      case "upload":
        if (!parsed.form) throw invalidRequest();
        return await upload(ctx, parsed.form);
      case "list":
        return await list(ctx, requireJson(parsed));
      case "download":
        return await download(ctx, requireJson(parsed));
      case "rename":
        return await rename(ctx, requireJson(parsed));
      case "delete":
        return await remove(ctx, requireJson(parsed));
      case "rewrap":
        return await rewrap(ctx, requireJson(parsed));
      case "import_lead_files":
        return await importLeadFiles(ctx, requireJson(parsed));
      default:
        throw invalidRequest();
    }
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.code }, { status: error.status });
    // Fixed text and the error's class name only: never the message, which could contain private details.
    console.error("customer-attachments: unexpected error", (error as Error)?.name ?? "unknown");
    return jsonResponse({ error: "server_error" }, { status: 500 });
  }
}

async function parseBody(req: Request): Promise<Parsed> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const action = form.get("action");
      if (typeof action !== "string") throw invalidRequest();
      return { action, json: null, form };
    }
    const text = await req.text();
    const json = text ? JSON.parse(text) : null;
    if (json === null || typeof json !== "object" || Array.isArray(json) || typeof json.action !== "string") {
      throw invalidRequest();
    }
    return { action: json.action, json, form: null };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalidRequest();
  }
}

function requireJson(parsed: Parsed): Row {
  if (!parsed.json) throw invalidRequest();
  return parsed.json;
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw invalidRequest();
  return value;
}

// ---------------------------------------------------------------------------------------------
// Permissions, logging, keys
// ---------------------------------------------------------------------------------------------

async function callBoolean(ctx: Ctx, name: string): Promise<boolean> {
  const { data, error } = await ctx.userClient.rpc(name);
  if (error) throw new Error("permission_check_failed");
  return data === true;
}

const isAdmin = (ctx: Ctx) => callBoolean(ctx, "is_admin");
const canManage = (ctx: Ctx) => callBoolean(ctx, "can_manage_customer_attachments");

// "Can the caller read this record?" is answered by the caller's own row-level security.
async function canRead(ctx: Ctx, table: "customers" | "leads", id: string): Promise<boolean> {
  const { data, error } = await ctx.userClient.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error("permission_check_failed");
  return !!data;
}

async function getActorName(ctx: Ctx): Promise<string> {
  if (ctx.actorName !== null) return ctx.actorName;
  let name = "Unknown user";
  try {
    const { data } = await ctx.admin.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle();
    const fullName = typeof data?.full_name === "string" ? data.full_name.trim() : "";
    if (fullName) name = fullName;
  } catch {
    // keep the fallback
  }
  ctx.actorName = name;
  return name;
}

interface LogEntry {
  action: string;
  customerId?: string | null;
  attachmentId?: string | null;
  detail?: Row | null;
}

// Best effort: a logging problem never changes the response. Never put file names or contents in `detail`.
async function writeLog(ctx: Ctx, entry: LogEntry): Promise<void> {
  try {
    await ctx.admin.from("customer_attachment_access_log").insert({
      customer_id: entry.customerId ?? null,
      attachment_id: entry.attachmentId ?? null,
      action: entry.action,
      actor_id: ctx.userId,
      actor_name: await getActorName(ctx),
      detail: entry.detail ?? null,
    });
  } catch {
    // ignore
  }
}

async function deny(ctx: Ctx, attempted: string, ids: { customerId?: string; attachmentId?: string } = {}): Promise<never> {
  await writeLog(ctx, {
    action: "denied",
    customerId: ids.customerId ?? null,
    attachmentId: ids.attachmentId ?? null,
    detail: { attempted },
  });
  throw new HttpError(403, "forbidden");
}

async function getKeks(ctx: Ctx): Promise<Keks> {
  if (ctx.keks) return ctx.keks;
  try {
    ctx.keks = await loadKeks(ctx.deps.getEnv);
  } catch {
    console.error("customer-attachments: key configuration invalid");
    throw serverError();
  }
  return ctx.keks;
}

// ---------------------------------------------------------------------------------------------
// Storing and reading encrypted files
// ---------------------------------------------------------------------------------------------

interface StoreInput {
  customerId: string;
  attachmentId: string;
  plain: Uint8Array;
  fileName: string;
  mimeType: string;
  uploadedBy: string | null;
  uploadedByName: string;
  sourceLeadId?: string;
  sourceLeadAttachmentId?: string;
  overwrite?: boolean; // only for the repeatable legacy step, whose ids are fixed
}

type StoreResult = { ok: true } | { ok: false; reason: "duplicate" | "failed" };

async function encryptAndStore(ctx: Ctx, input: StoreInput): Promise<StoreResult> {
  const keks = await getKeks(ctx);
  const kek = keks.keys.get(keks.currentVersion)!;
  const aad = buildAad(input.customerId, input.attachmentId);
  const dek = await generateDek();
  const { ciphertext, iv } = await encryptFile(input.plain, dek, aad);
  const wrapped = await wrapDek(dek, kek, aad);

  const path = `customer/${input.customerId}/${input.attachmentId}.enc`;
  const bucket = ctx.admin.storage.from(SECURE_BUCKET);
  const uploaded = await bucket.upload(path, ciphertext, {
    contentType: "application/octet-stream",
    upsert: input.overwrite === true,
  });
  if (uploaded.error) return { ok: false, reason: "failed" };

  const { error } = await ctx.admin.from("customer_secure_attachments").insert({
    id: input.attachmentId,
    customer_id: input.customerId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_size: input.plain.length,
    storage_path: path,
    wrapped_dek: wrapped,
    file_iv: iv,
    key_version: keks.currentVersion,
    uploaded_by: input.uploadedBy,
    uploaded_by_name: input.uploadedByName,
    source_lead_id: input.sourceLeadId ?? null,
    source_lead_attachment_id: input.sourceLeadAttachmentId ?? null,
  });
  if (error) {
    await bucket.remove([path]); // best effort: do not leave an orphaned ciphertext object behind
    return { ok: false, reason: error.code === "23505" ? "duplicate" : "failed" };
  }
  return { ok: true };
}

// Reads a stored file and decrypts it. Throws on any failure (missing object, wrong key, tampering).
async function readSecureFile(ctx: Ctx, row: Row): Promise<Uint8Array> {
  const { data: blob, error } = await ctx.admin.storage.from(SECURE_BUCKET).download(row.storage_path);
  if (error || !blob) throw new Error("storage_read_failed");
  const keks = await getKeks(ctx);
  const kek = keks.keys.get(Number(row.key_version));
  if (!kek) throw new Error("unknown_key_version");
  const aad = buildAad(row.customer_id, row.id);
  const dek = await unwrapDek(row.wrapped_dek, kek, aad);
  return await decryptFile(new Uint8Array(await blob.arrayBuffer()), row.file_iv, dek, aad);
}

async function loadSecureRow(ctx: Ctx, attachmentId: string): Promise<Row | null> {
  const { data, error } = await ctx.admin.from("customer_secure_attachments").select("*").eq("id", attachmentId).maybeSingle();
  if (error) throw new Error("row_read_failed");
  return data ?? null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

// upload: any signed-in user who can read the customer.
async function upload(ctx: Ctx, form: FormData): Promise<Response> {
  const customerId = requireUuid(form.get("customer_id"));
  const file = form.get("file");
  if (!(file instanceof File)) throw invalidRequest();

  if (!(await canRead(ctx, "customers", customerId))) return await deny(ctx, "upload", { customerId });

  const plain = new Uint8Array(await file.arrayBuffer());
  if (plain.length === 0) throw invalidRequest();
  if (plain.length > MAX_FILE_BYTES) throw new HttpError(413, "file_too_large");
  const mimeType = detectMimeType(plain);
  if (!mimeType) throw new HttpError(415, "unsupported_type");

  const attachmentId = ctx.deps.newId();
  const fileName = sanitizeFileName(file.name);
  const stored = await encryptAndStore(ctx, {
    customerId,
    attachmentId,
    plain,
    fileName,
    mimeType,
    uploadedBy: ctx.userId,
    uploadedByName: await getActorName(ctx),
  });
  if (!stored.ok) throw serverError();

  await writeLog(ctx, { action: "upload", customerId, attachmentId });
  return jsonResponse({ id: attachmentId, file_name: fileName, file_size: plain.length, mime_type: mimeType });
}

// list: managers. For admins, old unencrypted files of this customer are secured first (6.6).
async function list(ctx: Ctx, json: Row): Promise<Response> {
  const customerId = requireUuid(json.customer_id);
  if (!(await canManage(ctx))) return await deny(ctx, "list", { customerId });

  if (await isAdmin(ctx)) await secureLegacyFiles(ctx, customerId);

  const { data, error } = await ctx.admin
    .from("customer_secure_attachments")
    .select("id,file_name,mime_type,file_size,uploaded_by_name,created_at,source_lead_attachment_id")
    .eq("customer_id", customerId);
  if (error) throw new Error("list_failed");

  const rows = ((data ?? []) as Row[]).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  await writeLog(ctx, { action: "list", customerId });
  return jsonResponse({
    attachments: rows.map((row) => ({
      id: row.id,
      file_name: row.file_name,
      mime_type: row.mime_type,
      file_size: Number(row.file_size),
      uploaded_by_name: row.uploaded_by_name ?? null,
      created_at: row.created_at,
      from_lead: row.source_lead_attachment_id !== null && row.source_lead_attachment_id !== undefined,
    })),
  });
}

// download: managers.
async function download(ctx: Ctx, json: Row): Promise<Response> {
  const attachmentId = requireUuid(json.attachment_id);
  if (!(await canManage(ctx))) return await deny(ctx, "download", { attachmentId });
  const row = await loadSecureRow(ctx, attachmentId);
  if (!row) return await deny(ctx, "download", { attachmentId });

  let plain: Uint8Array;
  try {
    plain = await readSecureFile(ctx, row);
  } catch (error) {
    if ((error as Error)?.message === "kek_config_invalid") throw serverError();
    await writeLog(ctx, { action: "decrypt_failed", customerId: row.customer_id, attachmentId });
    throw serverError();
  }

  await writeLog(ctx, { action: "download", customerId: row.customer_id, attachmentId });
  return new Response(plain as BodyInit, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// rename: managers.
async function rename(ctx: Ctx, json: Row): Promise<Response> {
  const attachmentId = requireUuid(json.attachment_id);
  if (typeof json.file_name !== "string") throw invalidRequest();
  if (!(await canManage(ctx))) return await deny(ctx, "rename", { attachmentId });
  const row = await loadSecureRow(ctx, attachmentId);
  if (!row) return await deny(ctx, "rename", { attachmentId });

  const fileName = sanitizeFileName(json.file_name);
  const { error } = await ctx.admin
    .from("customer_secure_attachments")
    .update({ file_name: fileName, updated_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (error) throw serverError();

  await writeLog(ctx, { action: "rename", customerId: row.customer_id, attachmentId });
  return jsonResponse({ id: attachmentId, file_name: fileName });
}

// delete: managers. The stored object goes first; the row is only removed once the object is gone.
async function remove(ctx: Ctx, json: Row): Promise<Response> {
  const attachmentId = requireUuid(json.attachment_id);
  if (!(await canManage(ctx))) return await deny(ctx, "delete", { attachmentId });
  const row = await loadSecureRow(ctx, attachmentId);
  if (!row) return await deny(ctx, "delete", { attachmentId });

  const removed = await ctx.admin.storage.from(SECURE_BUCKET).remove([row.storage_path]);
  if (removed.error) throw serverError();
  const { error } = await ctx.admin.from("customer_secure_attachments").delete().eq("id", attachmentId);
  if (error) throw serverError();

  await writeLog(ctx, { action: "delete", customerId: row.customer_id, attachmentId });
  return jsonResponse({ id: attachmentId });
}

// rewrap: admins only. Re-encrypts the small per-file keys under the current root key. Files are not touched.
async function rewrap(ctx: Ctx, json: Row): Promise<Response> {
  if (!(await isAdmin(ctx))) return await deny(ctx, "rewrap");
  const limitValue = json.limit === undefined ? 200 : json.limit;
  if (typeof limitValue !== "number" || !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 500) {
    throw invalidRequest();
  }

  const keks = await getKeks(ctx);
  const currentKek = keks.keys.get(keks.currentVersion)!;
  const { data, error } = await ctx.admin
    .from("customer_secure_attachments")
    .select("id,customer_id,wrapped_dek,key_version")
    .neq("key_version", keks.currentVersion);
  if (error) throw serverError();

  const pending = (data ?? []) as Row[];
  let rewrapped = 0;
  for (const row of pending.slice(0, limitValue)) {
    try {
      const oldKek = keks.keys.get(Number(row.key_version));
      if (!oldKek) continue;
      const wrapped = await rewrapDek(row.wrapped_dek, oldKek, currentKek, buildAad(row.customer_id, row.id));
      const { error: updateError } = await ctx.admin
        .from("customer_secure_attachments")
        .update({ wrapped_dek: wrapped, key_version: keks.currentVersion, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (!updateError) rewrapped++;
    } catch {
      // leave this row for a later run
    }
  }

  const remaining = pending.length - rewrapped;
  await writeLog(ctx, { action: "rewrap", detail: { rewrapped, remaining } });
  return jsonResponse({ rewrapped, remaining });
}

// import_lead_files: copies a converted lead's files into the customer's secure store.
// The lead's original files and rows are never modified or deleted.
async function importLeadFiles(ctx: Ctx, json: Row): Promise<Response> {
  const leadId = requireUuid(json.lead_id);
  const customerId = requireUuid(json.customer_id);
  const offsetValue = json.offset === undefined ? 0 : json.offset;
  if (typeof offsetValue !== "number" || !Number.isInteger(offsetValue) || offsetValue < 0) throw invalidRequest();
  const offset = offsetValue;

  // All three must hold, otherwise the same generic 403.
  const canReadLead = await canRead(ctx, "leads", leadId);
  const canReadCustomer = await canRead(ctx, "customers", customerId);
  if (!canReadLead || !canReadCustomer) return await deny(ctx, "import_lead_files", { customerId });
  const { data: lead, error: leadError } = await ctx.admin
    .from("leads")
    .select("converted_to_customer_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw serverError();
  if (!lead || lead.converted_to_customer_id !== customerId) return await deny(ctx, "import_lead_files", { customerId });

  const { data, error } = await ctx.admin
    .from("entity_attachments")
    .select("id,file_name,file_path,created_at")
    .eq("entity_type", "lead")
    .eq("entity_id", leadId)
    .not("file_path", "is", null)
    .eq("storage_missing", false);
  if (error) throw serverError();

  const ordered = ((data ?? []) as Row[]).slice().sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))
  );
  const slice = ordered.slice(offset, offset + IMPORT_BATCH);
  const nextOffset = offset + IMPORT_BATCH < ordered.length ? offset + IMPORT_BATCH : null;

  let imported = 0;
  let alreadyImported = 0;
  const skipped: { file_name: string; reason: string }[] = [];
  const actorName = await getActorName(ctx);

  // One file at a time, so that no more than one file is ever held in memory.
  for (const leadFile of slice) {
    const fileName = sanitizeFileName(String(leadFile.file_name ?? ""));

    const { data: existing, error: existingError } = await ctx.admin
      .from("customer_secure_attachments")
      .select("id")
      .eq("customer_id", customerId)
      .eq("source_lead_attachment_id", leadFile.id)
      .maybeSingle();
    if (existingError) throw serverError();
    if (existing) {
      alreadyImported++;
      continue;
    }

    const { data: blob, error: downloadError } = await ctx.admin.storage.from(LEGACY_BUCKET).download(leadFile.file_path);
    if (downloadError || !blob) {
      const missing = /not.?found|does not exist|no such/i.test(String(downloadError?.message ?? "")) || !downloadError;
      skipped.push({ file_name: fileName, reason: missing ? "missing_file" : "read_failed" });
      continue;
    }
    const plain = new Uint8Array(await blob.arrayBuffer());
    if (plain.length > MAX_FILE_BYTES) {
      skipped.push({ file_name: fileName, reason: "too_large" });
      continue;
    }
    const mimeType = detectMimeType(plain);
    if (!mimeType || plain.length === 0) {
      skipped.push({ file_name: fileName, reason: "unsupported_type" });
      continue;
    }

    const attachmentId = ctx.deps.newId();
    const stored = await encryptAndStore(ctx, {
      customerId,
      attachmentId,
      plain,
      fileName,
      mimeType,
      uploadedBy: ctx.userId,
      uploadedByName: actorName,
      sourceLeadId: leadId,
      sourceLeadAttachmentId: leadFile.id,
    });
    if (stored.ok) {
      imported++;
      await writeLog(ctx, { action: "import_lead_file", customerId, attachmentId, detail: { lead_id: leadId } });
    } else if (stored.reason === "duplicate") {
      alreadyImported++; // another call imported it first
    } else {
      skipped.push({ file_name: fileName, reason: "read_failed" });
    }
  }

  return jsonResponse({ imported, already_imported: alreadyImported, skipped, next_offset: nextOffset });
}

// ---------------------------------------------------------------------------------------------
// Legacy securing step (used by `list`, only for admins)
// ---------------------------------------------------------------------------------------------
//
// Old customer files sit unencrypted in the bucket `crm-attachments`, with a row in `entity_attachments`
// (entity_type = 'customer'). Each one is encrypted into the secure store using the legacy row's own id as the
// new attachment id (which makes the step repeatable). The legacy file is deleted ONLY after the encrypted copy
// has been downloaded, decrypted and compared byte for byte with the original. Any problem leaves the legacy
// file untouched. Failures never reach the caller.

async function secureLegacyFiles(ctx: Ctx, customerId: string): Promise<void> {
  try {
    const { data, error } = await ctx.admin
      .from("entity_attachments")
      .select("id,file_name,file_path")
      .eq("entity_type", "customer")
      .eq("entity_id", customerId);
    if (error || !data?.length) return;
    for (const legacy of data as Row[]) {
      try {
        await secureOneLegacyFile(ctx, customerId, legacy);
      } catch {
        console.error("customer-attachments: legacy step failed");
      }
    }
  } catch {
    console.error("customer-attachments: legacy step failed");
  }
}

async function secureOneLegacyFile(ctx: Ctx, customerId: string, legacy: Row): Promise<void> {
  if (!legacy.file_path) return;
  const legacyBucket = ctx.admin.storage.from(LEGACY_BUCKET);

  const { data: blob, error: downloadError } = await legacyBucket.download(legacy.file_path);
  if (downloadError || !blob) return; // cannot read it: leave it alone
  const plain = new Uint8Array(await blob.arrayBuffer());

  let secureRow = await loadSecureRow(ctx, legacy.id);
  let createdNow = false;

  if (!secureRow) {
    if (plain.length === 0 || plain.length > MAX_FILE_BYTES) return;
    const mimeType = detectMimeType(plain);
    if (!mimeType) return;
    const stored = await encryptAndStore(ctx, {
      customerId,
      attachmentId: legacy.id,
      plain,
      fileName: sanitizeFileName(String(legacy.file_name ?? "")),
      mimeType,
      uploadedBy: null,
      uploadedByName: "Legacy import",
      overwrite: true,
    });
    if (!stored.ok) {
      if (stored.reason !== "duplicate") return;
    } else {
      createdNow = true;
    }
    secureRow = await loadSecureRow(ctx, legacy.id);
    if (!secureRow) return;
  }

  // Verify before deleting anything.
  let verified = false;
  try {
    const decrypted = await readSecureFile(ctx, secureRow);
    verified = (await sha256(decrypted)) === (await sha256(plain));
  } catch {
    verified = false;
  }

  if (!verified) {
    if (createdNow) {
      // Our own new copy is bad: remove it and keep the legacy file.
      await ctx.admin.storage.from(SECURE_BUCKET).remove([secureRow.storage_path]);
      await ctx.admin.from("customer_secure_attachments").delete().eq("id", legacy.id);
    }
    return;
  }

  const removed = await legacyBucket.remove([legacy.file_path]);
  if (removed.error) return; // keep the legacy row so that a later run can finish
  await ctx.admin.from("entity_attachments").delete().eq("id", legacy.id);
  await writeLog(ctx, { action: "legacy_secured", customerId, attachmentId: legacy.id });
}
