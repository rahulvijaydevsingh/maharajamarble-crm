import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

async function deletePrefixStorageFiles(admin: any, prefix: string): Promise<string[]> {
  const deletedFiles: string[] = [];
  try {
    const { data: files, error: listErr } = await admin.storage.from("crm-backups").list(prefix.replace(/\/$/, ""), {
      limit: 100,
      offset: 0,
    });
    if (!listErr && files && files.length > 0) {
      const pathsToDelete = files.map((f: any) => `${prefix}${f.name}`);
      const { data: removed } = await admin.storage.from("crm-backups").remove(pathsToDelete);
      if (removed) {
        deletedFiles.push(...removed.map((r: any) => r.name || r));
      }
    }

    const tablesPrefix = `${prefix}tables`;
    const { data: tableFiles, error: tableListErr } = await admin.storage.from("crm-backups").list(tablesPrefix, {
      limit: 500,
    });
    if (!tableListErr && tableFiles && tableFiles.length > 0) {
      const tablePathsToDelete = tableFiles.map((f: any) => `${tablesPrefix}/${f.name}`);
      const { data: removedTables } = await admin.storage.from("crm-backups").remove(tablePathsToDelete);
      if (removedTables) {
        deletedFiles.push(...removedTables.map((r: any) => r.name || r));
      }
    }
  } catch (err) {
    console.error(`Error deleting storage files for prefix ${prefix}:`, err);
  }
  return deletedFiles;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminAuth = await requireAdmin(req);
  if (!adminAuth.ok) {
    return jsonResponse({ error: adminAuth.error }, { status: adminAuth.status });
  }

  const admin = createAdminClient();
  const body = await readJson<{ backup_id?: string }>(req);
  const backupId = body.backup_id;

  if (!backupId) {
    return jsonResponse({ error: "backup_id is required" }, { status: 400 });
  }

  try {
    // Retrieve target job
    const { data: job, error: jobErr } = await admin
      .from("backup_jobs")
      .select("*")
      .eq("id", backupId)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ error: "Backup job not found" }, { status: 404 });
    }

    // Guard 1: Cannot delete a pinned backup
    if (job.is_pinned) {
      return jsonResponse({ error: "Cannot delete a pinned backup. Unpin first." }, { status: 409 });
    }

    // Guard 2: Cannot delete the single newest completed backup across all backups
    const { data: newestCompleted } = await admin
      .from("backup_jobs")
      .select("id")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newestCompleted && newestCompleted.id === job.id) {
      return jsonResponse(
        { error: "Safety Net Violation: the most recent backup cannot be deleted." },
        { status: 409 },
      );
    }

    // Resolve admin identity
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", adminAuth.userId)
      .maybeSingle();

    const deletedBy = profile?.full_name || adminAuth.userEmail || adminAuth.userId;

    // Delete storage files
    const prefix = job.storage_prefix || `backups/${job.id}/`;
    const deletedFiles = await deletePrefixStorageFiles(admin, prefix);

    const nowIso = new Date().toISOString();

    // Update backup_jobs status
    await admin
      .from("backup_jobs")
      .update({
        status: "manually_deleted",
        zip_path: null,
        manifest_path: null,
        pruned_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", job.id);

    // Record in backup_deletion_log
    await admin.from("backup_deletion_log").insert({
      backup_job_id: job.id,
      backup_tier: job.backup_tier,
      backup_created_at: job.created_at,
      deleted_by: deletedBy,
      deletion_reason: "manual",
      files_deleted: deletedFiles,
    });

    return jsonResponse({
      status: "success",
      message: "Backup manually deleted",
      backup_id: job.id,
    });
  } catch (err) {
    console.error("Error in crm-backup-delete:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});
