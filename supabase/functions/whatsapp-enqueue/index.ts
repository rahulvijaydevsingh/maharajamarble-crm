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

function decodePlusCodeCenter(fullCode: string): { lat: number; lng: number } | null {
  const ALPHABET = "23456789CFGHJMPQRVWX";
  const clean = fullCode.trim().toUpperCase().replace(/\+/g, "");
  if (clean.length < 8) return null;

  let lat = -90.0;
  let lng = -180.0;
  let latPlace = 400.0;
  let lngPlace = 400.0;

  const pairLen = Math.min(clean.length, 10);
  for (let i = 0; i < pairLen; i += 2) {
    latPlace /= 20.0;
    lngPlace /= 20.0;
    const latDigit = ALPHABET.indexOf(clean[i]);
    const lngDigit = ALPHABET.indexOf(clean[i + 1]);
    if (latDigit < 0 || lngDigit < 0) return null;
    lat += latDigit * latPlace;
    lng += lngDigit * lngPlace;
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
    const adminClient = createServiceClient();
    const authResult = await authenticateStaffRequest(req, adminClient);
    if (!authResult.ok) {
      return authResult.response;
    }
    const { caller } = authResult;

    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id ?? "").trim();
    const mode = (body.mode ?? "preview") as "preview" | "commit";
    const kind = (body.kind ?? "single") as "single" | "bulk";
    const slot = (body.slot ?? "main") as "main" | "bulk" | "personal";
    const recipients: RecipientInput[] = Array.isArray(body.recipients) ? body.recipients : [];
    const message = body.message ?? {};
    const templateText = typeof message.template_text === "string" ? message.template_text : "";
    const attachmentInput = message.attachment ?? null;
    const locationInput = message.location ?? null;
    const scheduleStartAt = body.schedule?.start_at ?? new Date().toISOString();

    if (!requestId) {
      return jsonErr("INVALID_REQUEST", "request_id is required", 400);
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

    // Check caller permission for slot
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

    // Validate attachment if provided
    let resolvedMediaRef: Record<string, unknown> | null = null;
    if (attachmentInput) {
      if (attachmentInput.library_item_id) {
        const { data: libItem } = await adminClient
          .from("whatsapp_library_items")
          .select("*")
          .eq("id", String(attachmentInput.library_item_id))
          .eq("active", true)
          .maybeSingle();

        if (!libItem) {
          return jsonErr("MEDIA_INVALID", "Selected library item is missing or inactive.", 400);
        }
        resolvedMediaRef = {
          library_item_id: libItem.id,
          kind: libItem.kind,
          bucket: libItem.bucket,
          path: libItem.path,
          filename: libItem.filename,
          mime: libItem.mime,
          size_bytes: libItem.size_bytes,
          sha256: libItem.sha256,
          external_url: libItem.external_url,
        };
      } else if (typeof attachmentInput.staging_path === "string") {
        const stagingPath = attachmentInput.staging_path.trim();
        const expectedPrefix = `whatsapp-staging/${caller.userId}/`;
        if (!stagingPath.startsWith(expectedPrefix)) {
          return jsonErr("MEDIA_INVALID", "Staging attachment must belong to your user folder.", 400);
        }
        resolvedMediaRef = {
          kind: attachmentInput.kind ?? "document",
          bucket: "crm-attachments",
          path: stagingPath,
          filename: attachmentInput.filename ?? stagingPath.split("/").pop() ?? "attachment.pdf",
          mime: attachmentInput.mime ?? "application/pdf",
          size_bytes: Number(attachmentInput.size_bytes ?? 0),
        };
      }
    }

    // Resolve suppression set
    const { data: suppressions } = await adminClient
      .from("whatsapp_suppressions")
      .select("phone10")
      .is("lifted_at", null);
    const suppressedSet = new Set<string>(
      (suppressions ?? []).map((s: { phone10: string }) => s.phone10),
    );

    const seenPhones = new Set<string>();
    const previewRecipients: Array<Record<string, unknown>> = [];
    const commitRows: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];

    for (const rec of recipients) {
      let entityRow: Record<string, unknown> | null = null;
      if (rec.entity_type && rec.entity_id) {
        const table =
          rec.entity_type === "lead"
            ? "leads"
            : rec.entity_type === "customer"
            ? "customers"
            : "professionals";
        const { data } = await adminClient
          .from(table)
          .select("*")
          .eq("id", rec.entity_id)
          .maybeSingle();
        entityRow = data;
      }

      const rawPhone = String(rec.phone ?? entityRow?.phone ?? "");
      const phone10 = normalizePhone10(rawPhone);
      const recipientName = String(rec.name ?? entityRow?.name ?? "Customer").trim();
      const firmName = String(
        entityRow?.firm_name ?? entityRow?.company_name ?? "",
      ).trim();
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

      // Resolve location payload per recipient if requested
      let resolvedLocation: Record<string, unknown> | null = null;
      if (locationInput && typeof locationInput === "object") {
        const locMode = locationInput.mode ?? "showroom";
        if (locMode === "showroom") {
          if (settings.showroom_lat != null && settings.showroom_lng != null) {
            resolvedLocation = {
              lat: Number(settings.showroom_lat),
              lng: Number(settings.showroom_lng),
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
          const lat = Number(locationInput.lat);
          const lng = Number(locationInput.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            resolvedLocation = {
              lat,
              lng,
              name: String(locationInput.name ?? "Pinned Location"),
              address: String(locationInput.address ?? ""),
            };
          } else {
            blockedReasons.push("LOCATION_INVALID");
          }
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
            ...(rec.related_entity_id ? { related_entity_id: rec.related_entity_id } : {}),
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
    const previewSecret = Deno.env.get("WA_PREVIEW_SECRET") ?? (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "fallback-secret");
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

    // Commit mode: verify preview_token (Sec 8.2)
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
      return jsonErr("ENQUEUE_FAILED", campaignErr.message, 400);
    }

    await broadcastDoorbellWake(adminClient, "campaign_enqueued");

    return jsonOk({
      campaign_id: campaignRes?.campaign_id,
      queued: campaignRes?.queued ?? 0,
      skipped: campaignRes?.skipped ?? 0,
      replayed: Boolean(campaignRes?.replayed),
      estimated_finish_at: new Date(Date.now() + estimatedDurationSeconds * 1000).toISOString(),
    });
  } catch (err) {
    return jsonErr("INTERNAL_ERROR", err instanceof Error ? err.message : "Unexpected error", 500);
  }
});