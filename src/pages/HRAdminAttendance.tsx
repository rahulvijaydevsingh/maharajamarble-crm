import React, { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, CheckCircle2, AlertTriangle, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface StaffAttendanceRow {
  staff_id: string;
  full_name: string;
  email: string;
  role: string;
  status: "present" | "absent" | "leave" | "not_marked";
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  clock_in_verified: boolean;
  clock_in_flag: string | null;
}

export default function HRAdminAttendance() {
  const { isAdmin, role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<StaffAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin()) navigate("/hr/attendance");
  }, [role, navigate, isAdmin]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    // Get all staff profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .neq("role", "sales_viewer")
      .order("full_name");

    // Get today's attendance for all staff
    const { data: records } = await supabase
      .from("attendance_records")
      .select("staff_id, status, clock_in, clock_out, total_hours, clock_in_verified, clock_in_flag")
      .eq("date", today);

    const recordMap = new Map<string, any>();
    (records || []).forEach(r => recordMap.set(r.staff_id, r));

    const merged: StaffAttendanceRow[] = (profiles || []).map(p => {
      const rec = recordMap.get(p.id);
      return {
        staff_id: p.id,
        full_name: (p as any).full_name || (p as any).email,
        email: (p as any).email,
        role: (p as any).role,
        status: rec ? rec.status : "not_marked",
        clock_in: rec?.clock_in || null,
        clock_out: rec?.clock_out || null,
        total_hours: rec?.total_hours ?? null,
        clock_in_verified: rec?.clock_in_verified ?? false,
        clock_in_flag: rec?.clock_in_flag || null,
      };
    });

    setRows(merged);
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Summary counts
  const present = rows.filter(r => r.status === "present").length;
  const absent = rows.filter(r => r.status === "absent" || r.status === "not_marked").length;
  const onLeave = rows.filter(r => r.status === "leave").length;
  const clocked_in_now = rows.filter(r => r.clock_in && !r.clock_out).length;

  const statusColor = (status: string) => {
    switch (status) {
      case "present": return "bg-green-100 text-green-800 border-green-200";
      case "absent": return "bg-red-100 text-red-800 border-red-200";
      case "leave": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const fmt = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team Attendance</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE, MMMM d, yyyy")} · Refreshed at {fmt(lastRefreshed.toISOString())}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Present Today", value: present, color: "text-green-700", bg: "bg-green-50 border-green-200" },
            { label: "Currently Working", value: clocked_in_now, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
            { label: "On Leave", value: onLeave, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
            { label: "Absent / Not Marked", value: absent, color: "text-red-700", bg: "bg-red-50 border-red-200" },
          ].map(card => (
            <Card key={card.label} className={`border ${card.bg}`}>
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Staff Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> All Staff — Today
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>GPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12">
                    <Clock className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : rows.map(row => (
                  <TableRow key={row.staff_id}>
                    <TableCell>
                      <div className="font-medium">{row.full_name}</div>
                      <div className="text-xs text-muted-foreground">{row.role}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(row.status)}>
                        {row.status === "not_marked" ? "Not Marked" : row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{fmt(row.clock_in)}</TableCell>
                    <TableCell className="text-sm">{fmt(row.clock_out)}</TableCell>
                    <TableCell className="text-sm">
                      {row.total_hours != null && row.total_hours > 0
                        ? `${Math.floor(row.total_hours)}h ${Math.round((row.total_hours % 1) * 60)}m`
                        : row.clock_in && !row.clock_out ? "In progress" : "—"}
                    </TableCell>
                    <TableCell>
                      {row.clock_in_flag
                        ? <AlertTriangle className="h-4 w-4 text-orange-500" />
                        : row.clock_in_verified
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
