import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

type DataType = "photos" | "location";
type Candidate = {
  id: string;
  staff_id: string;
  date: string;
  clock_in_photo_url: string | null;
  clock_out_photo_url: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
};

function getIndiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateBefore(days: number, today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

function safeAttendancePath(path: string | null, staffId: string): string | null {
  if (!path || path.includes("://") || path.startsWith("/") || path.includes("\\") || path.includes("..")) return null;
  const segments = path.split("/");
  if (segments[0] !== staffId || segments.some((segment) => !segment || segment === ".")) return null;
  return path;
}

async function getCandidates(admin: any, staffId?: string): Promise<Candidate[]> {
  const today = getIndiaDate();
  const oldestGlobalDate = dateBefore(30, today);
  const results: Candidate[] = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    let query = admin.from("attendance_records")
      .select("id,staff_id,date,clock_in_photo_url,clock_out_photo_url,clock_in_latitude,clock_in_longitude,clock_out_latitude,clock_out_longitude")
      .lt("date", oldestGlobalDate)
      .order("date", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (staffId) query = query.eq("staff_id", staffId);
    const { data, error } = await query;
    if (error) throw new Error(`Could not read attendance records: ${error.message}`);
    const rows = (data || []) as Candidate[];
    results.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createAdminClient();

  const cronHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  let authorized = Boolean(cronHeader && expectedCronSecret && cronHeader === expectedCronSecret);
  if (!authorized) {
    const auth = await requireAdmin(req);
    authorized = auth.ok;
  }
  if (!authorized) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson<{ staff_id?: string; data_type?: DataType; dry_run?: boolean }>(req);
  if (body.data_type && !["photos", "location"].includes(body.data_type)) {
    return jsonResponse({ error: "data_type must be photos or location" }, { status: 400 });
  }
  const dryRun = body.dry_run === true;
  const today = getIndiaDate();

  try {
    const { data: settingsRows, error: settingsError } = await admin.from("staff_hr_settings")
      .select("staff_id,photo_retention_days,location_retention_days");
    if (settingsError) throw new Error(`Could not read HR retention settings: ${settingsError.message}`);
    const settingsByStaff = new Map<string, { photos: number; location: number }>();
    for (const row of settingsRows || []) {
      settingsByStaff.set(row.staff_id, {
        photos: Math.max(30, Number(row.photo_retention_days ?? 60)),
        location: Math.max(30, Number(row.location_retention_days ?? 30)),
      });
    }

    const attendanceRows = await getCandidates(admin, body.staff_id);
    let photosCleared = 0;
    let locationsCleared = 0;
    let eligiblePhotos = 0;
    let eligibleLocations = 0;
    const pending: Array<{ record_id: string; staff_id: string; attendance_date: string; data_type: DataType; reason: string }> = [];

    for (const record of attendanceRows) {
      const policy = settingsByStaff.get(record.staff_id) || { photos: 60, location: 30 };
      const photoCutoff = dateBefore(policy.photos, today);
      const locationCutoff = dateBefore(policy.location, today);
      const photoEligible = Boolean(
        body.data_type !== "location" &&
        record.date < photoCutoff &&
        (record.clock_in_photo_url || record.clock_out_photo_url)
      );
      const locationEligible = Boolean(
        body.data_type !== "photos" &&
        record.date < locationCutoff &&
        (
          record.clock_in_latitude !== null || record.clock_in_longitude !== null ||
          record.clock_out_latitude !== null || record.clock_out_longitude !== null
        )
      );

      if (photoEligible) {
        eligiblePhotos++;
        if (!dryRun) {
        const originalIn = record.clock_in_photo_url;
        const originalOut = record.clock_out_photo_url;
        const rawPaths = [originalIn, originalOut].filter((value): value is string => Boolean(value));
        const paths = rawPaths.map((path) => safeAttendancePath(path, record.staff_id));
        if (paths.some((path) => !path)) {
          pending.push({ record_id: record.id, staff_id: record.staff_id, attendance_date: record.date, data_type: "photos", reason: "A stored photo path is not a safe staff-scoped Storage path; references were preserved." });
        } else {
          const { error: removeError } = await admin.storage.from("attendance-photos").remove(paths as string[]);
          if (removeError) {
            pending.push({ record_id: record.id, staff_id: record.staff_id, attendance_date: record.date, data_type: "photos", reason: removeError.message || "Storage API could not remove the photo." });
          } else {
            let update = admin.from("attendance_records").update({
              clock_in_photo_url: null, clock_out_photo_url: null,
            }).eq("id", record.id);
            update = originalIn ? update.eq("clock_in_photo_url", originalIn) : update.is("clock_in_photo_url", null);
            update = originalOut ? update.eq("clock_out_photo_url", originalOut) : update.is("clock_out_photo_url", null);
            const { data: updated, error: updateError } = await update.select("id").maybeSingle();
            if (updateError || !updated) {
              pending.push({ record_id: record.id, staff_id: record.staff_id, attendance_date: record.date, data_type: "photos", reason: updateError?.message || "The attendance record changed during cleanup; database references were not cleared." });
            } else photosCleared++;
          }
        }
        }
      }

      if (locationEligible) {
        eligibleLocations++;
        if (!dryRun) {
        const { error: updateError } = await admin.from("attendance_records").update({
          clock_in_latitude: null,
          clock_in_longitude: null,
          clock_out_latitude: null,
          clock_out_longitude: null,
        }).eq("id", record.id);
        if (updateError) {
          pending.push({ record_id: record.id, staff_id: record.staff_id, attendance_date: record.date, data_type: "location", reason: updateError.message });
        } else locationsCleared++;
        }
      }
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      scanned_records: attendanceRows.length,
      eligible_photos: eligiblePhotos,
      eligible_locations: eligibleLocations,
      photos_cleared: photosCleared,
      locations_cleared: locationsCleared,
      pending,
      defaults: { photo_retention_days: 60, location_retention_days: 30 },
    });
  } catch (error) {
    console.error("attendance-photo-prune failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
