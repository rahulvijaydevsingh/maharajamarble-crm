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
    if (settingsError) throw new Error("Could not read HR retention settings: " + settingsError.message);
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
    const photoCandidates: Array<{ record: Candidate; paths: string[] }> = [];
    const locationCandidates: Candidate[] = [];

    // Select eligible records and validate staff-scoped storage paths first.
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
        (record.clock_in_latitude !== null || record.clock_in_longitude !== null ||
         record.clock_out_latitude !== null || record.clock_out_longitude !== null)
      );

      if (photoEligible) {
        eligiblePhotos++;
        if (!dryRun) {
          const rawPaths = [record.clock_in_photo_url, record.clock_out_photo_url]
            .filter((value): value is string => Boolean(value));
          const paths = rawPaths.map((path) => safeAttendancePath(path, record.staff_id));
          if (paths.some((path) => !path)) {
            pending.push({
              record_id: record.id, staff_id: record.staff_id, attendance_date: record.date,
              data_type: "photos",
              reason: "A stored photo path is not a safe staff-scoped Storage path; references were preserved.",
            });
          } else if (paths.length > 0) {
            photoCandidates.push({ record, paths: [...new Set(paths as string[])] });
          }
        }
      }

      if (locationEligible) {
        eligibleLocations++;
        if (!dryRun) locationCandidates.push(record);
      }
    }

    if (!dryRun) {
      // Remove storage objects in chunks; do not clear a record unless every
      // one of its referenced objects was successfully removed.
      const allPhotoPaths = [...new Set(photoCandidates.flatMap((candidate) => candidate.paths))];
      const removedPhotoPaths = new Set<string>();
      const failedPhotoPaths = new Map<string, string>();
      const storageChunkSize = 100;
      for (let offset = 0; offset < allPhotoPaths.length; offset += storageChunkSize) {
        const chunk = allPhotoPaths.slice(offset, offset + storageChunkSize);
        const { error: removeError } = await admin.storage.from("attendance-photos").remove(chunk);
        if (removeError) {
          for (const path of chunk) failedPhotoPaths.set(path, removeError.message || "Storage API could not remove the photo.");
        } else {
          for (const path of chunk) removedPhotoPaths.add(path);
        }
      }

      const photoRecordsToClear: Candidate[] = [];
      for (const candidate of photoCandidates) {
        const failedPath = candidate.paths.find((path) => !removedPhotoPaths.has(path));
        if (failedPath) {
          pending.push({
            record_id: candidate.record.id, staff_id: candidate.record.staff_id,
            attendance_date: candidate.record.date, data_type: "photos",
            reason: failedPhotoPaths.get(failedPath) || "One or more photo objects were not confirmed removed; references were preserved.",
          });
        } else {
          photoRecordsToClear.push(candidate.record);
        }
      }

      // Clear photo URL columns in bounded batches after storage removal.
      const recordById = new Map(photoRecordsToClear.map((record) => [record.id, record]));
      const photoRecordIds = photoRecordsToClear.map((record) => record.id);
      const dbChunkSize = 100;
      for (let offset = 0; offset < photoRecordIds.length; offset += dbChunkSize) {
        const chunk = photoRecordIds.slice(offset, offset + dbChunkSize);
        const { data: updated, error: updateError } = await admin.from("attendance_records")
          .update({ clock_in_photo_url: null, clock_out_photo_url: null })
          .in("id", chunk)
          .select("id");
        if (updateError) {
          for (const id of chunk) {
            const record = recordById.get(id)!;
            pending.push({
              record_id: id, staff_id: record.staff_id, attendance_date: record.date, data_type: "photos",
              reason: "Photo objects were removed but database references could not be cleared: " + updateError.message,
            });
          }
          continue;
        }
        const updatedIds = new Set((updated || []).map((row: { id: string }) => row.id));
        photosCleared += updatedIds.size;
        for (const id of chunk) {
          if (!updatedIds.has(id)) {
            const record = recordById.get(id)!;
            pending.push({
              record_id: id, staff_id: record.staff_id, attendance_date: record.date, data_type: "photos",
              reason: "Photo objects were removed but the attendance row was not updated (it may have changed during cleanup).",
            });
          }
        }
      }

      // Clear expired GPS columns in bounded batches; attendance rows remain.
      const locationById = new Map(locationCandidates.map((record) => [record.id, record]));
      const locationRecordIds = locationCandidates.map((record) => record.id);
      for (let offset = 0; offset < locationRecordIds.length; offset += dbChunkSize) {
        const chunk = locationRecordIds.slice(offset, offset + dbChunkSize);
        const { data: updated, error: updateError } = await admin.from("attendance_records")
          .update({
            clock_in_latitude: null,
            clock_in_longitude: null,
            clock_out_latitude: null,
            clock_out_longitude: null,
          })
          .in("id", chunk)
          .select("id");
        if (updateError) {
          for (const id of chunk) {
            const record = locationById.get(id)!;
            pending.push({
              record_id: id, staff_id: record.staff_id, attendance_date: record.date, data_type: "location",
              reason: updateError.message,
            });
          }
          continue;
        }
        const updatedIds = new Set((updated || []).map((row: { id: string }) => row.id));
        locationsCleared += updatedIds.size;
        for (const id of chunk) {
          if (!updatedIds.has(id)) {
            const record = locationById.get(id)!;
            pending.push({
              record_id: id, staff_id: record.staff_id, attendance_date: record.date, data_type: "location",
              reason: "Attendance row was not updated (it may have changed during cleanup).",
            });
          }
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
      batch_sizes: { storage_remove: 100, attendance_update: 100 },
    });
  } catch (error) {
    console.error("attendance-photo-prune failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});