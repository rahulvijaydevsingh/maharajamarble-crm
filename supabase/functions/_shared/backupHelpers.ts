import { BACKUP_EXCLUDED_TABLES } from "./crmBackupConfig.ts";

export const PAGE_SIZE = 1000;

export async function fetchAllRows(admin: any, table: string) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function discoverAllTables(admin: any): Promise<string[]> {
  const { data, error } = await admin.rpc("list_public_tables");
  if (error || !data) {
    if (error) console.warn("discoverAllTables fallback:", error.message);
    return [];
  }
  return (data as Array<{ table_name: string }>)
    .map((r) => r.table_name)
    .filter((t) => !BACKUP_EXCLUDED_TABLES.has(t));
}

export function toCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}
