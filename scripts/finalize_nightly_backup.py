#!/usr/bin/env python3
"""Runner-side ZIP finalizer for nightly Supabase backups; standard library only."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys
import tempfile, time, urllib.error, urllib.parse, urllib.request, zipfile
from pathlib import Path

BUCKET = "crm-backups"
RAW_RE = re.compile(r"^[A-Za-z0-9_]+\.(?:json|csv)$", re.IGNORECASE)
TABLE_RE = re.compile(r"^[A-Za-z0-9_]+$")


class BackupFinalizeError(RuntimeError):
    pass


def config():
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base.startswith("https://") or not key:
        raise BackupFinalizeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")
    return base, key


def auth(key):
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def api_json(base, key, method, path, payload=None):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    headers = auth(key)
    headers["Accept"] = "application/json"
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    last_error = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read(4096).decode("utf-8", errors="replace")
            last_error = BackupFinalizeError(f"{method} {path}: HTTP {exc.code}: {detail}")
            if exc.code not in (408, 425, 429) and exc.code < 500:
                raise last_error
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        if attempt < 3:
            time.sleep(attempt * 2)
    raise BackupFinalizeError(f"{method} {path} failed after retries: {last_error}")


def object_url(base, access, path):
    return f"{base}/storage/v1/object/{access}/{BUCKET}/{urllib.parse.quote(path, safe='/')}"


def download_object(base, key, path, target):
    request = urllib.request.Request(object_url(base, "authenticated", path), headers=auth(key))
    last_error = None
    for attempt in range(1, 4):
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(request, timeout=180) as response, target.open("wb") as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
            if target.stat().st_size <= 0:
                raise BackupFinalizeError(f"Storage object {path} is empty.")
            return
        except urllib.error.HTTPError as exc:
            detail = exc.read(4096).decode("utf-8", errors="replace")
            last_error = BackupFinalizeError(f"Download {path}: HTTP {exc.code}: {detail}")
            if exc.code not in (408, 425, 429) and exc.code < 500:
                raise last_error
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        if attempt < 3:
            time.sleep(attempt * 2)
    raise BackupFinalizeError(f"Download {path} failed after retries: {last_error}")


def storage_list(base, key, prefix):
    result, offset, limit = [], 0, 1000
    while True:
        page = api_json(base, key, "POST", f"/storage/v1/object/list/{BUCKET}", {
            "prefix": prefix, "limit": limit, "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
        })
        if not isinstance(page, list):
            raise BackupFinalizeError(f"Unexpected Storage list response for {prefix}.")
        result.extend(item for item in page if isinstance(item, dict))
        if len(page) < limit:
            return result
        offset += limit


def verify_manifest(manifest, tables):
    if not isinstance(manifest, dict) or manifest.get("integrity_status") != "valid":
        raise BackupFinalizeError("manifest.json is missing or does not declare valid integrity.")
    if manifest.get("tableCount") != len(tables) or manifest.get("tables") != tables:
        raise BackupFinalizeError("manifest.json table list/order does not match backup_jobs.")


def build_archive(archive_path, source_root, tables):
    manifest_path = source_root / "manifest.json"
    with manifest_path.open("r", encoding="utf-8") as handle:
        verify_manifest(json.load(handle), tables)
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=1, allowZip64=True) as archive:
        archive.write(manifest_path, "manifest.json")
        for table in tables:
            if not TABLE_RE.fullmatch(table):
                raise BackupFinalizeError(f"Unsafe table name: {table!r}")
            json_path = source_root / "tables" / f"{table}.json"
            csv_path = source_root / "tables" / f"{table}.csv"
            if not json_path.is_file() or json_path.stat().st_size <= 0:
                raise BackupFinalizeError(f"Missing or empty tables/{table}.json.")
            if not csv_path.is_file() or csv_path.stat().st_size <= 0:
                raise BackupFinalizeError(f"Missing or empty tables/{table}.csv.")
            with json_path.open("r", encoding="utf-8") as handle:
                rows = json.load(handle)
            if not isinstance(rows, list):
                raise BackupFinalizeError(f"tables/{table}.json is not a JSON array.")
            del rows
            archive.write(json_path, f"tables/{table}.json")
            archive.write(csv_path, f"tables/{table}.csv")


def verify_archive(archive_path, tables):
    expected = {"manifest.json"}
    for table in tables:
        if not TABLE_RE.fullmatch(table):
            raise BackupFinalizeError(f"Unsafe table name: {table!r}")
        expected.update((f"tables/{table}.json", f"tables/{table}.csv"))
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            names = archive.namelist()
            if len(names) != len(expected) or set(names) != expected:
                raise BackupFinalizeError(f"ZIP member set mismatch ({len(names)} vs {len(expected)}).")
            corrupt = archive.testzip()
            if corrupt:
                raise BackupFinalizeError(f"ZIP CRC validation failed for {corrupt}.")
            verify_manifest(json.loads(archive.read("manifest.json")), tables)
            for table in tables:
                with archive.open(f"tables/{table}.json") as handle:
                    rows = json.load(handle)
                if not isinstance(rows, list):
                    raise BackupFinalizeError(f"ZIP table JSON is not an array for {table}.")
                del rows
    except (OSError, zipfile.BadZipFile, KeyError, json.JSONDecodeError) as exc:
        raise BackupFinalizeError(f"Could not verify backup ZIP: {exc}") from exc


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def upload_archive(base, key, archive_path, object_path):
    command = [
        "curl", "--silent", "--show-error", "--fail-with-body", "--retry", "3",
        "--retry-all-errors", "--max-time", "900", "-X", "POST",
        f"{base}/storage/v1/object/{BUCKET}/{urllib.parse.quote(object_path, safe='/')}",
        "-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}",
        "-H", "Content-Type: application/zip", "-H", "x-upsert: true",
        "--data-binary", f"@{archive_path}",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        detail = (result.stderr or result.stdout or "no response body").strip()
        raise BackupFinalizeError(f"Storage upload failed: {detail[-2000:]}")


def remove_raw_objects(base, key, prefix):
    folder, deleted, leftovers = f"{prefix}tables", 0, []
    for _ in range(3):
        entries = storage_list(base, key, folder)
        paths = [
            f"{folder}/{entry['name']}" for entry in entries
            if entry.get("id") and RAW_RE.fullmatch(str(entry.get("name", "")))
        ]
        if paths:
            api_json(base, key, "DELETE", f"/storage/v1/object/{BUCKET}", {"prefixes": paths})
            deleted += len(paths)
        remaining = storage_list(base, key, folder)
        leftovers = [
            entry.get("name") for entry in remaining
            if entry.get("id") and RAW_RE.fullmatch(str(entry.get("name", "")))
        ]
        if not leftovers:
            return deleted
        time.sleep(2)
    raise BackupFinalizeError(f"Raw table-file cleanup incomplete: {leftovers[:20]}")


def fetch_job(base, key, job_id):
    fields = "id,status,integrity_status,error_message,created_at,completed_at,storage_prefix,manifest_path,zip_path,checksum_sha256,total_size_bytes,duration_ms,table_count,tables_to_export,tables_completed,progress"
    query = urllib.parse.urlencode({"id": f"eq.{job_id}", "select": fields})
    result = api_json(base, key, "GET", f"/rest/v1/backup_jobs?{query}")
    if not isinstance(result, list) or len(result) != 1:
        raise BackupFinalizeError(f"backup_jobs row not found or not unique for {job_id}.")
    return result[0]


def complete_job(base, key, job, job_id, prefix, tables, checksum, size_bytes):
    now = dt.datetime.now(dt.timezone.utc)
    created = dt.datetime.fromisoformat(str(job["created_at"]).replace("Z", "+00:00"))
    duration_ms = max(0, int((now - created).total_seconds() * 1000))
    progress = dict(job.get("progress") or {})
    progress.update({
        "tables_done": len(tables), "tables_total": len(tables), "current_table": None,
        "raw_files_cleanup": "completed", "raw_files_cleanup_warning": None,
        "finalized_by": "github-actions-runner",
    })
    patch = {
        "status": "completed", "completed_at": job.get("completed_at") or now.isoformat(),
        "manifest_path": f"{prefix}manifest.json", "zip_path": f"{prefix}backup.zip",
        "checksum_sha256": checksum, "total_size_bytes": size_bytes,
        "duration_ms": duration_ms, "table_count": len(tables),
        "integrity_status": "valid", "error_message": None, "progress": progress,
        "updated_at": now.isoformat(),
    }
    query = urllib.parse.urlencode({"id": f"eq.{job_id}"})
    api_json(base, key, "PATCH", f"/rest/v1/backup_jobs?{query}", patch)


def finalize(job_id):
    import uuid
    try:
        normalized_id = str(uuid.UUID(job_id))
    except ValueError as exc:
        raise BackupFinalizeError("job_id must be a valid UUID.") from exc
    base, key = config()
    job = fetch_job(base, key, normalized_id)
    if job.get("status") not in ("processing", "completed"):
        raise BackupFinalizeError(f"Refusing fallback for job status={job.get('status')!r}.")
    tables, completed = job.get("tables_to_export"), job.get("tables_completed")
    progress = job.get("progress") or {}
    if not isinstance(tables, list) or not tables or not isinstance(completed, list):
        raise BackupFinalizeError("Backup job has no complete table export plan.")
    if len(tables) != len(set(tables)) or set(completed) != set(tables):
        raise BackupFinalizeError("Runner fallback requires every planned table to be completed.")
    if int(progress.get("tables_done", -1)) != len(tables) or int(progress.get("tables_total", -1)) != len(tables):
        raise BackupFinalizeError("backup_jobs.progress does not confirm tables_done == tables_total.")
    prefix = f"backups/{normalized_id}/"
    if job.get("storage_prefix") != prefix:
        raise BackupFinalizeError("Refusing an unexpected storage_prefix.")
    zip_path = f"{prefix}backup.zip"

    with tempfile.TemporaryDirectory(prefix=f"crm-backup-{normalized_id}-") as temp:
        root = Path(temp)
        archive_path, persisted_path = root / "backup.zip", root / "backup.persisted.zip"
        entries = storage_list(base, key, f"{prefix}tables")
        root_entries = storage_list(base, key, prefix.rstrip("/"))
        remote_zip = any(e.get("id") and e.get("name") == "backup.zip" for e in root_entries)
        raw_names = {
            str(e.get("name")) for e in entries
            if e.get("id") and RAW_RE.fullmatch(str(e.get("name", "")))
        }
        expected_names = {f"{table}.{ext}" for table in tables for ext in ("json", "csv")}
        use_existing = remote_zip and (
            job.get("status") == "completed" or not expected_names.issubset(raw_names)
        )

        if use_existing:
            download_object(base, key, zip_path, archive_path)
            verify_path = archive_path
        else:
            if not expected_names.issubset(raw_names):
                raise BackupFinalizeError(f"Missing raw table objects: {sorted(expected_names - raw_names)[:20]}")
            source = root / "source"
            download_object(base, key, f"{prefix}manifest.json", source / "manifest.json")
            with (source / "manifest.json").open("r", encoding="utf-8") as handle:
                verify_manifest(json.load(handle), tables)
            for table in tables:
                download_object(base, key, f"{prefix}tables/{table}.json", source / "tables" / f"{table}.json")
                download_object(base, key, f"{prefix}tables/{table}.csv", source / "tables" / f"{table}.csv")
            build_archive(archive_path, source, tables)
            verify_archive(archive_path, tables)
            upload_archive(base, key, archive_path, zip_path)
            download_object(base, key, zip_path, persisted_path)
            verify_path = persisted_path

        verify_archive(verify_path, tables)
        checksum, size_bytes = sha256_file(verify_path), verify_path.stat().st_size
        if job.get("status") == "completed" and job.get("checksum_sha256") not in (None, checksum):
            raise BackupFinalizeError("Existing completed backup checksum does not match the stored ZIP.")
        deleted = remove_raw_objects(base, key, prefix)
        complete_job(base, key, job, normalized_id, prefix, tables, checksum, size_bytes)
        confirmed = fetch_job(base, key, normalized_id)
        if confirmed.get("status") != "completed" or confirmed.get("integrity_status") != "valid":
            raise BackupFinalizeError("Job update was not confirmed as completed/valid.")
        remaining = storage_list(base, key, f"{prefix}tables")
        if any(e.get("id") and RAW_RE.fullmatch(str(e.get("name", ""))) for e in remaining):
            raise BackupFinalizeError("Raw table files remain after runner finalization.")
        print(f"Runner finalization verified job_id={normalized_id}")
        print(f"status={confirmed['status']} integrity_status={confirmed['integrity_status']}")
        print(f"tables={len(tables)} zip_bytes={size_bytes} sha256={checksum}")
        print(f"raw_table_files_deleted={deleted} remaining=0")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-id", required=True, help="backup_jobs.id to finalize or verify")
    args = parser.parse_args()
    try:
        finalize(args.job_id)
    except (BackupFinalizeError, urllib.error.URLError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
