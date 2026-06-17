import React, { useEffect, useState, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar, Plus, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

interface LeaveBalance {
  id: string;
  leave_type: string;
  total_allowed: number;
  used: number;
  remaining: number;
}

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  admin_comment?: string | null;
  half_day_type?: string | null;
  created_at: string;
}

const leaveTypeLabels: Record<string, string> = {
  sick: "Sick Leave",
  casual: "Casual Leave",
  earned: "Earned Leave",
  half_day: "Half Day",
  lwp: "Leave Without Pay",
};

export default function HRLeave() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [leaveType, setLeaveType] = useState("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDayType, setHalfDayType] = useState("morning");
  const [reason, setReason] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const [{ data: balData }, { data: reqData }] = await Promise.all([
        supabase
          .from("leave_balances")
          .select("*")
          .eq("staff_id", user.id)
          .eq("year", currentYear) as any,
        supabase
          .from("leave_requests")
          .select("*")
          .eq("staff_id", user.id)
          .order("created_at", { ascending: false }) as any,
      ]);
      setBalances(balData || []);
      setRequests(reqData || []);
    } catch (err) {
      console.error("Error fetching leave data:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const balanceCards = useMemo(() => {
    const types = ["sick", "casual", "earned"];
    return types.map((type) => {
      const bal = balances.find((b) => b.leave_type === type);
      return {
        type,
        label: leaveTypeLabels[type],
        used: bal?.used ?? 0,
        total: bal?.total_allowed ?? 0,
        remaining: bal?.remaining ?? 0,
      };
    });
  }, [balances]);

  const getBalanceColor = (remaining: number) => {
    if (remaining > 5) return "text-green-600";
    if (remaining >= 2) return "text-orange-500";
    return "text-red-600";
  };

  const getProgressColor = (remaining: number) => {
    if (remaining > 5) return "[&>div]:bg-green-500";
    if (remaining >= 2) return "[&>div]:bg-orange-500";
    return "[&>div]:bg-red-500";
  };

  const calculatedDays = useMemo(() => {
    if (leaveType === "half_day") return 0.5;
    if (!startDate) return 0;
    const end = endDate || startDate;
    let count = 0;
    const current = new Date(startDate + "T00:00:00");
    const endD = new Date(end + "T00:00:00");
    while (current <= endD) {
      const day = current.getDay();
      if (day !== 0) count++; // exclude Sunday by default
      current.setDate(current.getDate() + 1);
    }
    return count;
  }, [startDate, endDate, leaveType]);

  const currentBalance = useMemo(() => {
    const mappedType = leaveType === "half_day" ? "casual" : leaveType;
    if (mappedType === "lwp") return null;
    const bal = balances.find((b) => b.leave_type === mappedType);
    return bal ? bal.remaining : 0;
  }, [leaveType, balances]);

  const handleSubmit = async () => {
    if (!reason || reason.trim().length < 10) {
      toast.error("Reason must be at least 10 characters");
      return;
    }
    if (!startDate) {
      toast.error("Please select a start date");
      return;
    }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/hr-leave-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            leave_type: leaveType,
            start_date: startDate,
            end_date: leaveType === "half_day" ? startDate : (endDate || startDate),
            reason,
            half_day_type: leaveType === "half_day" ? halfDayType : null,
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to submit");

      toast.success(
        `Leave request submitted! ${result.affected_tasks_count > 0 ? `(${result.affected_tasks_count} tasks affected during this period)` : ""}`
      );
      setModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setLeaveType("casual");
    setStartDate("");
    setEndDate("");
    setHalfDayType("morning");
    setReason("");
  };

  const handleCancel = async (id: string) => {
    try {
      const { error } = await supabase.from("leave_requests").delete().eq("id", id) as any;
      if (error) throw error;
      toast.success("Leave request cancelled");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel request");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Leave</h1>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Request Leave
          </Button>
        </div>

        {/* Leave Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {balanceCards.map((card) => (
            <Card key={card.type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-end justify-between">
                  <span className={`text-2xl font-bold ${getBalanceColor(card.remaining)}`}>
                    {card.remaining}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {card.used} / {card.total} used
                  </span>
                </div>
                <Progress
                  value={card.total > 0 ? (card.used / card.total) * 100 : 0}
                  className={`h-2 ${getProgressColor(card.remaining)}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Leave History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dates</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Comment</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No leave requests yet
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-sm">
                        {format(new Date(req.start_date + "T00:00:00"), "MMM d")}
                        {req.start_date !== req.end_date && (
                          <> – {format(new Date(req.end_date + "T00:00:00"), "MMM d")}</>
                        )}
                        {req.half_day_type && (
                          <span className="text-muted-foreground ml-1">({req.half_day_type})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {leaveTypeLabels[req.leave_type] || req.leave_type}
                      </TableCell>
                      <TableCell className="text-sm">{req.total_days}</TableCell>
                      <TableCell>{statusBadge(req.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {(req as any).admin_comment || (req as any).rejection_reason || "—"}
                      </TableCell>
                      <TableCell>
                        {req.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleCancel(req.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Request Leave Modal */}
      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
            <DialogDescription>Submit a leave request for approval.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="casual">Casual Leave</SelectItem>
                  <SelectItem value="earned">Earned Leave</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="lwp">Leave Without Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{leaveType === "half_day" ? "Date" : "Start Date"}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              {leaveType === "half_day" ? (
                <div className="space-y-2">
                  <Label>Session</Label>
                  <Select value={halfDayType} onValueChange={setHalfDayType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                  />
                </div>
              )}
            </div>

            {startDate && (
              <div className="flex items-center justify-between text-sm bg-muted rounded-md p-3">
                <span className="text-muted-foreground">Working days:</span>
                <span className="font-semibold">{calculatedDays} day{calculatedDays !== 1 ? "s" : ""}</span>
              </div>
            )}

            {currentBalance !== null && startDate && (
              <div className={`text-sm p-3 rounded-md ${
                currentBalance < calculatedDays
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}>
                You have <strong>{currentBalance}</strong> {leaveType === "half_day" ? "casual" : leaveType} days remaining
                {currentBalance < calculatedDays && " (insufficient balance)"}
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please provide a reason (minimum 10 characters)..."
                rows={3}
              />
              {reason.length > 0 && reason.length < 10 && (
                <p className="text-xs text-destructive">{10 - reason.length} more characters needed</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !startDate || reason.trim().length < 10 || (currentBalance !== null && currentBalance < calculatedDays)}
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
