import React, { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format, getDaysInMonth, isWeekend } from "date-fns";

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export default function HRAttendanceGrid() {
  const { isAdmin, role } = useAuth();
  const navigate = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin()) navigate("/hr/attendance");
  }, [role, navigate, isAdmin]);

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = getDaysInMonth(new Date(year, month - 1));
    const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

    const [{ data: profiles }, { data: records }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").neq("role", "sales_viewer").order("full_name"),
      supabase.from("attendance_records").select("staff_id, date, status")
        .gte("date", startDate).lte("date", endDate),
    ]);

    const staffList = (profiles || []).map(p => ({
      id: p.id,
      name: (p as any).full_name || (p as any).email
    }));
    setStaff(staffList);

    // Build grid: { staff_id: { "2026-03-01": "present", ... } }
    const g: Record<string, Record<string, string>> = {};
    staffList.forEach(s => { g[s.id] = {}; });
    (records || []).forEach(r => {
      if (g[r.staff_id]) g[r.staff_id][r.date] = r.status;
    });
    setGrid(g);
    setLoading(false);
  }, [month, year]);

  useEffect(() => { fetchGrid(); }, [fetchGrid]);

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const cellColor = (status: string | undefined, dayNum: number) => {
    const date = new Date(year, month - 1, dayNum);
    if (isWeekend(date)) return "bg-gray-100 text-gray-400";
    switch (status) {
      case "present": return "bg-green-500 text-white";
      case "absent": return "bg-red-400 text-white";
      case "leave": return "bg-yellow-400 text-white";
      default: return "bg-gray-200 text-gray-400";
    }
  };

  const years = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Attendance Grid</h1>
          <div className="flex gap-3">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-sm">
          {[["bg-green-500","Present"],["bg-red-400","Absent"],["bg-yellow-400","Leave"],["bg-gray-200","Not Marked"],["bg-gray-100","Weekend"]].map(([c,l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded ${c}`} /><span>{l}</span>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-muted-foreground">Loading...</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white text-left px-3 py-2 font-semibold border-b border-r min-w-[140px]">Staff</th>
                    {days.map(d => {
                      const date = new Date(year, month - 1, d);
                      const isWE = isWeekend(date);
                      return (
                        <th key={d} className={`text-center py-2 px-1 border-b font-medium w-8 ${isWE ? "text-gray-400" : ""}`}>
                          <div>{d}</div>
                          <div className="text-[9px] font-normal">{format(date, "EEE")}</div>
                        </th>
                      );
                    })}
                    <th className="text-center py-2 px-2 border-b font-semibold border-l">P</th>
                    <th className="text-center py-2 px-2 border-b font-semibold">A</th>
                    <th className="text-center py-2 px-2 border-b font-semibold">L</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => {
                    const staffGrid = grid[s.id] || {};
                    const presentCount = Object.values(staffGrid).filter(v => v === "present").length;
                    const absentCount = Object.values(staffGrid).filter(v => v === "absent").length;
                    const leaveCount = Object.values(staffGrid).filter(v => v === "leave").length;
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="sticky left-0 bg-white px-3 py-1.5 border-b border-r font-medium truncate max-w-[140px]">{s.name}</td>
                        {days.map(d => {
                          const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                          const status = staffGrid[dateStr];
                          return (
                            <td key={d} className="border-b p-0.5">
                              <div className={`h-6 w-6 mx-auto rounded text-center flex items-center justify-center text-[9px] font-bold ${cellColor(status, d)}`}>
                                {status ? status[0].toUpperCase() : ""}
                              </div>
                            </td>
                          );
                        })}
                        <td className="text-center border-b border-l font-bold text-green-700">{presentCount}</td>
                        <td className="text-center border-b font-bold text-red-600">{absentCount}</td>
                        <td className="text-center border-b font-bold text-yellow-600">{leaveCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
