import {
  authenticateStaffRequest,
  broadcastDoorbellWake,
  corsHeaders,
  createServiceClient,
  jsonErr,
  jsonOk,
} from "../_shared/whatsappAuth.ts";
import {
  buildSiteMapLinkFromPlusCode,
  FULL_PLUS_CODE_REGEX,
  PlaceholderContext,
  renderTemplateForRecipient,
  sha256Hex,
  signPreviewToken,
  verifyPreviewToken,
} from "../_shared/whatsappPlaceholders.ts";

interface RecipientInput {
  entity_type?: "lead" | "customer" | "professional";
  entity_id?: string;
  phone?: string;
  name?: string;
  quotation_number?: string;
  quotation_total?: string;
  valid_until?: string;
  related_entity_type?: string;
  related_entity_id?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MEDIA_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_PDF_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function validateMediaMetadata(mimeRaw: unknown, sizeRaw: unknown): { ok: true; mime: string; size: number } | { ok: false; message: string } {
  const mime = typeof mimeRaw === "string" ? mimeRaw.trim().toLowerCase() : "";
  const size = typeof sizeRaw === "number" ? sizeRaw : Number(sizeRaw);
  if (!ALLOWED_MEDIA_MIMES.has(mime)) return { ok: false, message: "Only PDF, JPEG, PNG, and WebP attachments are allowed." };
  if (!Number.isSafeInteger(size) || size <= 0) return { ok: false, message: "Attachment size must be a positive whole number of bytes." };
  const maxBytes = mime === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (size > maxBytes) return { ok: false, message: mime === "application/pdf" ? "PDF attachments cannot exceed 16 MB." : "Image attachments cannot exceed 5 MB." };
  return { ok: true, mime, size };
}

function isSafeStoragePath(path: string): boolean {
  return Boolean(path) && !path.includes("..") && !path.includes("//") && !path.includes("\\") && !/[\x00-\x1f]/.test(path);
}

function normalizePhone10(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  let candidate: string | null = null;
  if (digits.length === 10) candidate = digits;
  else if (digits.length === 11 && digits.startsWith("0")) candidate = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith("91")) candidate = digits.slice(2);
  else if (digits.length === 14 && digits.startsWith("0091")) candidate = digits.slice(4);
  if (!candidate || !/^[6-9][0-9]{9}$/.test(candidate)) return null;
  return candidate;
}

function maskPhone10(phone10: string | null, rawFallback: string): string {
  if (!phone10) return rawFallback ? "******" : "Missing Phone";
  return `+91 ******${phone10.slice(-4)}`;
}

function parseCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d{1,3}(\.\d+)?$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
  }
  return null;
}

function decodePlusCodeCenter(fullCode: string): { lat: number; lng: number } | null {
  if (typeof fullCode !== "string") return null;
  const trimmed = fullCode.trim().toUpperCase();
  if (!FULL_PLUS_CODE_REGEX.test(trimmed)) return null;

  const ALPHABET = "23456789CFGHJMPQRVWX";
  const clean = trimmed.replace("+", "");

  let lat = -90.0;
  let lng = -180.0;
  let latPlace = 400.0;
  let lngPlace = 400.0;

  for (let i = 0; i < 10; i += 2) {
    latPlace /= 20.0;
    lngPlace /= 20.0;
    const latDigit = ALPHABET.indexOf(clean[i]);
    const lngDigit = ALPHABET.indexOf(clean[i + 1]);
    if (latDigit < 0 || lngDigit < 0) return null;
    lat += latDigit * latPlace;
    lng += lngDigit * lngPlace;
  }

  for (let i = 10; i < Math.min(clean.length, 15); i++) {
    latPlace /= 5.0;
    lngPlace /= 4.0;
    const digit = ALPHABET.indexOf(clean[i]);
    if (digit < 0) return null;
    lat += Math.floor(digit / 4) * latPlace;
    lng += (digit % 4) * lngPlace;
  }

  return {
    lat: Number((lat + latPlace / 2).toFixed(6)),
    lng: Number((lng + lngPlace / 2).toFixed(6)),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonErr("METHOD_NOT_ALLOWED", "POST required", 405);
  }

  try {
    const previewSecret = (Deno.env.get("WA_PREVIEW_SECRET") ?? "").trim();
    if (!previewSecret) {
      return jsonErr("SERVER_MISCONFIGURED", "WA_PREVIEW_SECRET is not configured on the server.", 500);
    }

    const adminClient = createServiceClient();
    const authResult = await authenticateStaffRequest(req, adminClient);
    if (!authResult.ok) {
      return authResult.response;
    }
    const { caller } = authResult;

    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id ?? "").trim();
    const mode = body.mode ?? "preview";
    const kind = body.kind ?? "single";
    const slot = body.slot ?? "main";
    const recipients: RecipientInput[] = Array.isArray(body.recipients) ? body.recipients : [];
    const message = body.message ?? {};
    const templateText = typeof message.template_text === "string" ? message.template_text : "";
    const attachmentInput = message.attachment ?? null;
    const locationInput = message.location ?? null;
    const scheduleStartAt = body.schedule?.start_at ?? new Date().toISOString();

    if (!UUID_REGEX.test(requestId)) {
      return jsonErr("INVALID_REQUEST", "request_id must be a valid UUID.", 400);
    }
    if (mode !== "preview" && mode !== "commit") {
      return jsonErr("INVALID_REQUEST", "mode must be 'preview' or 'commit'.", 400);
    }
    if (kind !== "single" && kind !== "bulk") {
      return jsonErr("INVALID_REQUEST", "kind must be 'single' or 'bulk'.", 400);
    }
    if (slot !== "main" && slot !== "bulk" && slot !== "personal") {
      return jsonErr("INVALID_SLOT", "slot must be 'main', 'bulk', or 'personal'.", 400);
    }

    const { data: settings } = await adminClient
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings?.module_enabled) {
      return jsonErr("MODULE_DISABLED", "WhatsApp integration is currently disabled in Settings.", 400);
    }
    if (settings?.kill_switch) {
      return jsonErr("KILL_SWITCH", "WhatsApp Kill Switch is active. All outbound sends are halted.", 400);
    }

    if (!caller.isAdmin) {
      const { data: perm } = await adminClient
        .from("whatsapp_user_permissions")
        .select("*")
        .eq("user_id", caller.userId)
        .maybeSingle();

      const allowed =
        (slot === "main" && perm?.can_use_main_whatsapp) ||
        (slot === "bulk" && perm?.can_use_bulk_whatsapp) ||
        (slot === "personal" && perm?.can_connect_own_qr);

      if (!allowed) {
        return jsonErr("FORBIDDEN", `You do not have permission to send from the ${slot} slot.`, 403);
      }
    }

    if (kind === "bulk" && slot !== "bulk") {
      return jsonErr("FORBIDDEN", "Bulk campaigns can only be sent from the Bulk WhatsApp slot.", 403);
    }

    const maxRecipients = kind === "single" ? 1 : Number(settings.bulk_max_recipients ?? 100);
    if (recipients.length === 0 || recipients.length > maxRecipients) {
      return jsonErr(
        "TOO_MANY_RECIPIENTS",
        `Recipients count (${recipients.length}) must be between 1 and ${maxRecipients}.`,
        400,
      );
    }

    // Validate attachment using authoritative library metadata or the caller-owned staging folder.
    let resolvedMediaRef: Record<string, unknown> | null = null;
    if (attachmentInput) {
      if (attachmentInput.library_item_id) {
        const libId = String(attachmentInput.library_item_id).trim();
        if (!UUID_REGEX.test(libId)) {
          return jsonErr("MEDIA_INVALID", "library_item_id must be a valid UUID.", 400);
        }
        const { data: libItem, error: libError } = await adminClient
          .from("whatsapp_library_items")
          .select("*")
          .eq("id", libId)
          .eq("active", true)
          .maybeSingle();
        if (libError || !libItem) {
          return jsonErr("MEDIA_INVALID", "Selected library item is missing or inactive.", 400);
        }
        const metadata = validateMediaMetadata(libItem.mime, libItem.size_bytes);
        const libraryPath = String(libItem.path ?? "");
        if (!metadata.ok || libItem.bucket !== "crm-attachments" || !libraryPath.startsWith("whatsapp-library/") || !isSafeStoragePath(libraryPath)) {
          return jsonErr("MEDIA_INVALID", metadata.ok ? "Library media metadata or storage path is invalid." : metadata.message, 400);
        }
        const folder = libraryPath.split("/").slice(0, -1).join("/");
        const storedName = libraryPath.split("/").pop() ?? "";
        const { data: storedFiles, error: storageListError } = await adminClient.storage
          .from("crm-attachments")
          .list(folder, { search: storedName, limit: 20 });
        const storedFile = (storedFiles ?? []).find((file: { name?: string }) => file.name === storedName);
        if (storageListError || !storedFile) {
          return jsonErr("MEDIA_NOT_FOUND", "The selected library file is missing from Storage.", 400);
        }
        resolvedMediaRef = {
          library_item_id: libItem.id,
          kind: libItem.kind,
          bucket: "crm-attachments",
          path: libraryPath,
          filename: libItem.filename ?? storedName,
          mime: metadata.mime,
          size_bytes: metadata.size,
          sha256: libItem.sha256,
        };
      } else if (typeof attachmentInput.staging_path === "string") {
        const stagingPath = attachmentInput.staging_path.trim();
        const expectedPrefix = "whatsapp-staging/" + caller.userId + "/";
        if (!stagingPath.startsWith(expectedPrefix) || !isSafeStoragePath(stagingPath)) {
          return jsonErr("MEDIA_INVALID", "Staging attachment path is invalid or outside your user folder.", 400);
        }
        const metadata = validateMediaMetadata(attachmentInput.mime, attachmentInput.size_bytes);
        if (!metadata.ok) return jsonErr("MEDIA_INVALID", metadata.message, 400);
        const folder = stagingPath.split("/").slice(0, -1).join("/");
        const storedName = stagingPath.split("/").pop() ?? "";
        const { data: storedFiles, error: storageListError } = await adminClient.storage
          .from("crm-attachments")
          .list(folder, { search: storedName, limit: 20 });
        const storedFile = (storedFiles ?? []).find((file: { name?: string }) => file.name === storedName);
        if (storageListError || !storedFile) {
          return jsonErr("MEDIA_NOT_FOUND", "The staging attachment is missing from Storage. Upload it again.", 400);
        }
        const fileMetadata = (storedFile.metadata ?? {}) as Record<string, unknown>;
        const actualSize = Number(fileMetadata.size ?? fileMetadata.contentLength ?? 0);
        const actualMime = String(fileMetadata.mimetype ?? fileMetadata.mimeType ?? "").split(";")[0].trim().toLowerCase();
        if (actualSize > 0 && actualSize !== metadata.size) {
          return jsonErr("MEDIA_METADATA_MISMATCH", "Staging attachment size does not match the uploaded object.", 400);
        }
        if (actualMime && actualMime !== metadata.mime) {
          return jsonErr("MEDIA_MIME_MISMATCH", "Staging attachment MIME type does not match the uploaded object.", 400);
        }
        const requestedName = String(attachmentInput.filename ?? storedName).trim();
        const filename = requestedName.split(/[\\/]/).pop()?.replace(/[\x00-\x1f]/g, "").slice(0, 120) || storedName;
        resolvedMediaRef = {
          kind: metadata.mime === "application/pdf" ? "document" : "image",
          bucket: "crm-attachments",
          path: stagingPath,
          filename,
          mime: metadata.mime,
          size_bytes: metadata.size,
        };
      } else {
        return jsonErr("MEDIA_INVALID", "Attachment must specify library_item_id or staging_path.", 400);
      }
    }
    // Load entities through caller.userClient so RLS is enforced (I8)
    const hydratedRecipients: Array<{
      input: RecipientInput;
      entityRow: Record<string, unknown> | null;
      entityMissing: boolean;
      rawPhone: string;
      phone10: string | null;
    }> = [];

    const candidatePhones = new Set<string>();

    for (const rec of recipients) {
      let entityRow: Record<string, unknown> | null = null;
      let entityMissing = false;

      if (rec.entity_type || rec.entity_id) {
        if (
          !rec.entity_type ||
          !["lead", "customer", "professional"].includes(rec.entity_type) ||
          !rec.entity_id ||
          !UUID_REGEX.test(rec.entity_id)
        ) {
          entityMissing = true;
        } else {
          const table =
            rec.entity_type === "lead"
              ? "leads"
              : rec.entity_type === "customer"
              ? "customers"
              : "professionals";
          const { data } = await caller.userClient
            .from(table)
            .select("*")
            .eq("id", rec.entity_id)
            .maybeSingle();
          if (!data) {
            entityMissing = true;
          } else {
            entityRow = data;
          }
        }
      }

      const rawPhone = String(rec.phone || entityRow?.phone || "").trim();
      const phone10 = normalizePhone10(rawPhone);
      if (phone10) {
        candidatePhones.add(phone10);
      }

      hydratedRecipients.push({
        input: rec,
        entityRow,
        entityMissing,
        rawPhone,
        phone10,
      });
    }

    // Query suppressions bounded to candidate phones
    const suppressedSet = new Set<string>();
    if (candidatePhones.size > 0) {
      const { data: suppressions } = await adminClient
        .from("whatsapp_suppressions")
        .select("phone10")
        .in("phone10", Array.from(candidatePhones))
        .is("lifted_at", null);

      for (const s of suppressions ?? []) {
        suppressedSet.add(String((s as { phone10: string }).phone10));
      }
    }

    const seenPhones = new Set<string>();
    const previewRecipients: Array<Record<string, unknown>> = [];
    const commitRows: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];

    for (const item of hydratedRecipients) {
      const { input: rec, entityRow, entityMissing, rawPhone, phone10 } = item;

      const recipientName = String(rec.name || entityRow?.name || "Customer").trim();
      const firmName = String(entityRow?.firm_name ?? entityRow?.company_name ?? "").trim();
      const siteLocation = String(entityRow?.site_location ?? "").trim();
      const sitePlusCode = String(entityRow?.site_plus_code ?? "").trim();
      const assignedTo = String(entityRow?.assigned_to ?? caller.fullName).trim();

      const ctx: PlaceholderContext = {
        name: recipientName,
        firm_name: firmName || null,
        site_location: siteLocation || null,
        site_plus_code: sitePlusCode || null,
        assigned_to: assignedTo || null,
        showroom_name: settings.showroom_name ?? "Maharaja Marble",
        showroom_map_link: settings.showroom_maps_url ?? null,
        quotation_number: rec.quotation_number ?? null,
        quotation_total: rec.quotation_total ?? null,
        valid_until: rec.valid_until ?? null,
      };

      const renderRes = templateText.trim().length > 0
        ? renderTemplateForRecipient(templateText, ctx, kind === "bulk")
        : {
            ok: Boolean(resolvedMediaRef || locationInput),
            renderedText: "",
            blockedReasons: resolvedMediaRef || locationInput ? [] : ["PLACEHOLDER_UNRESOLVED"],
            resolvedValues: {},
            hasPlaceholders: false,
          };

      const blockedReasons = [...renderRes.blockedReasons];

      if (entityMissing) {
        blockedReasons.push("ENTITY_NOT_ACCESSIBLE");
      }

      if (!phone10) {
        blockedReasons.push("PHONE_INVALID");
      } else {
        if (seenPhones.has(phone10)) {
          blockedReasons.push("DUPLICATE_RECIPIENT");
        }
        seenPhones.add(phone10);

        if (suppressedSet.has(phone10)) {
          blockedReasons.push("SUPPRESSED");
        }
      }

      let resolvedLocation: Record<string, unknown> | null = null;
      if (locationInput !== null && locationInput !== undefined) {
        if (typeof locationInput === "object" && !Array.isArray(locationInput)) {
          const locMode = locationInput.mode;
          if (locMode === "showroom") {
            const lat = parseCoordinate(settings.showroom_lat, -90, 90);
            const lng = parseCoordinate(settings.showroom_lng, -180, 180);
            if (lat !== null && lng !== null) {
              resolvedLocation = {
                lat,
                lng,
                name: settings.showroom_name ?? "Maharaja Marble Showroom",
                address: settings.showroom_address ?? "",
              };
            } else {
              blockedReasons.push("SHOWROOM_LOCATION_MISSING");
            }
          } else if (locMode === "site") {
            const decoded = sitePlusCode ? decodePlusCodeCenter(sitePlusCode) : null;
            if (decoded) {
              resolvedLocation = {
                lat: decoded.lat,
                lng: decoded.lng,
                name: `${recipientName} Site`,
                address: siteLocation || sitePlusCode,
              };
            } else {
              blockedReasons.push("SITE_PLUS_CODE_INVALID");
            }
          } else if (locMode === "custom") {
            const lat = parseCoordinate(locationInput.lat, -90, 90);
            const lng = parseCoordinate(locationInput.lng, -180, 180);
            if (lat !== null && lng !== null) {
              resolvedLocation = {
                lat,
                lng,
                name: String(locationInput.name ?? "Pinned Location"),
                address: String(locationInput.address ?? ""),
              };
            } else {
              blockedReasons.push("LOCATION_INVALID");
            }
          } else {
            blockedReasons.push("LOCATION_INVALID");
          }
        } else {
          blockedReasons.push("LOCATION_INVALID");
        }
      }

      const messageType = resolvedLocation
        ? "location"
        : resolvedMediaRef
        ? "media"
        : "text";

      const isOk = blockedReasons.length === 0;

      previewRecipients.push({
        entity_type: rec.entity_type ?? null,
        entity_id: rec.entity_id ?? null,
        recipient_name: recipientName,
        masked_phone: maskPhone10(phone10, rawPhone),
        rendered_text: renderRes.renderedText,
        message_type: messageType,
        location: resolvedLocation,
        status: isOk ? "ok" : "blocked",
        blocked_reasons: blockedReasons,
      });

      if (isOk && phone10) {
        commitRows.push({
          recipient_phone: `91${phone10}`,
          recipient_phone10: phone10,
          recipient_name: recipientName,
          lead_id: rec.entity_type === "lead" ? rec.entity_id : null,
          customer_id: rec.entity_type === "customer" ? rec.entity_id : null,
          professional_id: rec.entity_type === "professional" ? rec.entity_id : null,
          message_type: messageType,
          rendered_body: renderRes.renderedText,
          placeholder_values: {
            ...renderRes.resolvedValues,
            ...(rec.related_entity_type ? { related_entity_type: rec.related_entity_type } : {}),
            ...(rec.related_entity_id && UUID_REGEX.test(rec.related_entity_id)
              ? { related_entity_id: rec.related_entity_id }
              : {}),
            ...(buildSiteMapLinkFromPlusCode(sitePlusCode)
              ? { site_map_link: buildSiteMapLinkFromPlusCode(sitePlusCode) }
              : {}),
          },
          media_ref: resolvedMediaRef,
          location: resolvedLocation,
        });
      }
    }

    if (kind === "bulk" && !templateText.includes("{{")) {
      warnings.push("Bulk template has no personalized {{placeholder}}. Adding {{name}} is recommended.");
    }

    const previewHash = await sha256Hex(JSON.stringify(commitRows));
    const avgPaceSec = Math.round(((Number(settings.pace_min_seconds ?? 15)) + (Number(settings.pace_max_seconds ?? 35))) / 2);
    const estimatedDurationSeconds = commitRows.length * avgPaceSec;

    if (mode === "preview") {
      const expMs = Date.now() + 10 * 60 * 1000;
      const previewToken = await signPreviewToken(previewSecret, {
        userId: caller.userId,
        requestId,
        slot,
        previewHash,
        expMs,
      });

      return jsonOk({
        recipients: previewRecipients,
        summary: {
          count_ok: commitRows.length,
          count_blocked: previewRecipients.length - commitRows.length,
          estimated_duration_seconds: estimatedDurationSeconds,
          warnings,
        },
        preview_token: previewToken,
        preview_expires_at: new Date(expMs).toISOString(),
      });
    }

    const tokenCheck = await verifyPreviewToken(
      previewSecret,
      String(body.preview_token ?? ""),
      {
        userId: caller.userId,
        requestId,
        slot,
        previewHash,
      },
    );

    if (!tokenCheck.valid) {
      return jsonErr(
        tokenCheck.reason ?? "PREVIEW_REQUIRED",
        tokenCheck.reason === "PREVIEW_EXPIRED"
          ? "Preview expired after 10 minutes. Please re-run preview before sending."
          : "A valid preview_token is required before sending.",
        400,
      );
    }

    if (commitRows.length === 0) {
      return jsonErr("NO_VALID_RECIPIENTS", "All recipients were blocked during validation.", 400);
    }

    const { data: campaignRes, error: campaignErr } = await adminClient.rpc("wa_create_campaign", {
      p_payload: {
        request_id: requestId,
        kind,
        slot,
        source: body.source ?? "manual",
        title: body.title ?? (kind === "single" ? `Single send to ${commitRows[0].recipient_name}` : "Bulk Campaign"),
        template_body: templateText,
        media_ref: resolvedMediaRef,
        location: commitRows[0].location ?? null,
        scheduled_start_at: scheduleStartAt,
        estimated_duration_seconds: estimatedDurationSeconds,
        preview_hash: previewHash,
        requested_by: caller.fullName,
        requested_by_user_id: caller.userId,
        rows: commitRows,
      },
    });

    if (campaignErr) {
      return jsonErr("ENQUEUE_FAILED", "Could not enqueue WhatsApp campaign.", 400);
    }

    await broadcastDoorbellWake(adminClient, "campaign_enqueued");

    return jsonOk({
      campaign_id: campaignRes?.campaign_id,
      queued: campaignRes?.queued ?? 0,
      skipped: campaignRes?.skipped ?? 0,
      replayed: Boolean(campaignRes?.replayed),
      estimated_finish_at: new Date(Date.now() + estimatedDurationSeconds * 1000).toISOString(),
    });
  } catch {
    return jsonErr("INTERNAL_ERROR", "Unexpected error processing enqueue request.", 500);
  }
});