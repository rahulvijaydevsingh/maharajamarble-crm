import React, { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, CheckCircle2, AlertTriangle, LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ClockInOutModal } from "@/components/hr/ClockInOutModal";
import { format, subDays, isWeekend } from "date-fns";

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  clock_in_verified: boolean;
  clock_in_flag: string | null;
  clock_out_verified: boolean;
  clock_out_flag: string | null;
  clock_in_photo_url: string | null;
}

export default function HRAttendance() {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"clock-in" | "clock-out">("clock-in");
  const [elapsed, setElapsed] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const fourteenDaysAgo = format(subDays(new Date(), 14), "yyyy-MM-dd");

      const [{ data: todayData }, { data: historyData }] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("*")
          .eq("staff_id", user.id)
          .eq("date", today)
          .maybeSingle() as any,
        supabase
          .from("attendance_records")
          .select("*")
          .eq("staff_id", user.id)
          .gte("date", fourteenDaysAgo)
          .order("date", { ascending: false }) as any,
      ]);

      setTodayRecord(todayData || null);
      setHistory(historyData || []);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live elapsed counter
  useEffect(() => {
    if (!todayRecord?.clock_in || todayRecord?.clock_out) {
      setElapsed("");
      return;
    }
    const update = () => {
      const diff = Date.now() - new Date(todayRecord.clock_in!).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [todayRecord]);

  const openModal = (mode: "clock-in" | "clock-out") => {
    setModalMode(mode);
    setModalOpen(true);
  };

  const getStatusState = () => {
    if (!todayRecord) return "not_clocked_in";
    if (todayRecord.clock_in && !todayRecord.clock_out) return "clocked_in";
    return "clocked_out";
  };

  const state = getStatusState();

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case "present": return "bg-green-100 text-green-800 border-green-200";
      case "absent": return "bg-red-100 text-red-800 border-red-200";
      case "leave": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const flagBadge = (flag: string | null, verified: boolean) => {
    if (!flag && verified) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (flag) return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    return <span className="text-muted-foreground text-xs">—</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Attendance</h1>

        {/* Today's Status Card */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : state === "not_clocked_in" ? (
          <Card className="border-muted">
            <CardContent className="py-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-muted-foreground">Not Clocked In Today</h2>
                <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
              </div>
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white px-8"
                onClick={() => openModal("clock-in")}
              >
                <LogIn className="h-5 w-5 mr-2" />
                Clock In
              </Button>
            </CardContent>
          </Card>
        ) : state === "clocked_in" ? (
          <Card className="border-green-300 bg-green-50/50">
            <CardContent className="py-8 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-green-800">Clocked In</h2>
                  <p className="text-sm text-green-700">
                    at {todayRecord?.clock_in ? new Date(todayRecord.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-mono font-bold text-green-800">{elapsed}</p>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    {flagBadge(todayRecord?.clock_in_flag || null, todayRecord?.clock_in_verified ?? false)}
                    <span className="text-xs text-green-700">
                      {todayRecord?.clock_in_flag ? "GPS flagged" : "GPS verified"}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => openModal("clock-out")}
              >
                <LogOut className="h-5 w-5 mr-2" />
                Clock Out
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-blue-300 bg-blue-50/50">
            <CardContent className="py-8 space-y-3">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-blue-800">Today Complete</h2>
                <p className="text-3xl font-mono font-bold text-blue-800 mt-2">
                  {todayRecord?.total_hours != null
                    ? `${Math.floor(todayRecord.total_hours)}h ${Math.round((todayRecord.total_hours % 1) * 60)}m worked`
                    : "—"}
                </p>
              </div>
              <div className="flex justify-center gap-8 text-sm text-blue-700">
                <span>
                  In: {todayRecord?.clock_in ? new Date(todayRecord.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
                <span>
                  Out: {todayRecord?.clock_out ? new Date(todayRecord.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </div>
              {(todayRecord?.overtime_hours ?? 0) > 0 && (
                <p className="text-center text-sm text-blue-600">
                  +{todayRecord?.overtime_hours}h overtime
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Attendance History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last 14 Days</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No attendance records found
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium text-sm">
                        {format(new Date(rec.date + "T00:00:00"), "EEE, MMM d")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeColor(rec.status)}>
                          {rec.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {rec.clock_in
                          ? new Date(rec.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rec.clock_out
                          ? new Date(rec.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rec.total_hours != null ? `${rec.total_hours}h` : "—"}
                      </TableCell>
                      <TableCell>
                        {flagBadge(rec.clock_in_flag || rec.clock_out_flag || null, rec.clock_in_verified)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ClockInOutModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        onSuccess={fetchData}
      />
    </DashboardLayout>
  );
}
