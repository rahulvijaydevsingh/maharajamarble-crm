import React, { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, X, ListTodo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, eachDayOfInterval, parseISO } from "date-fns";

interface PendingRequest {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  half_day_type?: string | null;
  created_at: string;
  staff_name?: string;
  staff_email?: string;
  balance_remaining?: number;
  affected_tasks_count?: number;
}

interface ReviewedRequest {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  admin_comment?: string | null;
  rejection_reason?: string | null;
  approved_at?: string | null;
  staff_name?: string;
}

const leaveTypeLabels: Record<string, string> = {
  sick: "Sick Leave",
  casual: "Casual Leave",
  earned: "Earned Leave",
  half_day: "Half Day",
  lwp: "Leave Without Pay",
};

export default function HRLeaveApprovals() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [history, setHistory] = useState<ReviewedRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Action dialog
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    mode: "approve" | "reject";
    request: PendingRequest | null;
  }>({ open: false, mode: "approve", request: null });
  const [comment, setComment] = useState("");
  const [processing, setProcessing] = useState(false);

  // Delegation dialog
  const [delegationDialog, setDelegationDialog] = useState<{
    open: boolean;
    taskCount: number;
    staffName: string;
  }>({ open: false, taskCount: 0, staffName: "" });

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch pending requests
      const { data: pendingData } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true }) as any;

      // Fetch all reviewed requests
      const { data: historyData } = await supabase
        .from("leave_requests")
        .select("*")
        .neq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100) as any;

      // Get all unique staff IDs
      const allRequests = [...(pendingData || []), ...(historyData || [])];
      const staffIds = [...new Set(allRequests.map((r: any) => r.staff_id))];

      // Fetch staff profiles
      let profileMap: Record<string, string> = {};
      if (staffIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", staffIds);
        if (profiles) {
          profiles.forEach((p: any) => {
            profileMap[p.id] = p.full_name || p.email || "Unknown";
          });
        }
      }

      // Enrich pending with staff names, balances, and task counts
      const enrichedPending: PendingRequest[] = [];
      for (const req of (pendingData || [])) {
        const mappedType = req.leave_type === "half_day" ? "casual" : req.leave_type;
        let balanceRemaining: number | undefined;

        if (["sick", "casual", "earned"].includes(mappedType)) {
          const { data: bal } = await supabase
            .from("leave_balances")
            .select("remaining")
            .eq("staff_id", req.staff_id)
            .eq("leave_type", mappedType)
            .eq("year", new Date().getFullYear())
            .maybeSingle() as any;
          balanceRemaining = bal?.remaining;
        }

        // Check affected tasks
        const { count: taskCount } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", profileMap[req.staff_id] || req.staff_id)
          .gte("due_date", req.start_date)
          .lte("due_date", req.end_date)
          .neq("status", "Completed") as any;

        enrichedPending.push({
          ...req,
          staff_name: profileMap[req.staff_id] || "Unknown",
          balance_remaining: balanceRemaining,
          affected_tasks_count: taskCount || 0,
        });
      }

      setPending(enrichedPending);
      setHistory(
        (historyData || []).map((r: any) => ({
          ...r,
          staff_name: profileMap[r.staff_id] || "Unknown",
        }))
      );
    } catch (err) {
      console.error("Error fetching leave approvals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openActionDialog = (mode: "approve" | "reject", request: PendingRequest) => {
    setActionDialog({ open: true, mode, request });
    setComment("");
  };

  const handleAction = async () => {
    const { mode, request } = actionDialog;
    if (!request || !user) return;

    if (mode === "reject" && comment.trim().length < 5) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    setProcessing(true);
    try {
      // Update leave request
      const updateData: any = {
        status: mode === "approve" ? "approved" : "rejected",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      };

      if (comment.trim()) {
        updateData.admin_comment = comment.trim();
      }
      if (mode === "reject") {
        updateData.rejection_reason = comment.trim();
      }

      const { error: updateError } = await supabase
        .from("leave_requests")
        .update(updateData)
        .eq("id", request.id) as any;

      if (updateError) throw updateError;

      if (mode === "approve") {
        // Deduct from leave balances
        const mappedType = request.leave_type === "half_day" ? "casual" : request.leave_type;
        if (["sick", "casual", "earned"].includes(mappedType)) {
          const { data: currentBal } = await supabase
            .from("leave_balances")
            .select("*")
            .eq("staff_id", request.staff_id)
            .eq("leave_type", mappedType)
            .eq("year", new Date().getFullYear())
            .single() as any;

          if (currentBal) {
            await supabase
              .from("leave_balances")
              .update({
                used: currentBal.used + request.total_days,
                remaining: currentBal.remaining - request.total_days,
              })
              .eq("id", currentBal.id) as any;
          }
        }

        // Mark attendance records as on_leave for each date in range
        const dates = eachDayOfInterval({
          start: parseISO(request.start_date),
          end: parseISO(request.end_date),
        });

        for (const date of dates) {
          const dateStr = format(date, "yyyy-MM-dd");
          // Check if record exists
          const { data: existing } = await supabase
            .from("attendance_records")
            .select("id")
            .eq("staff_id", request.staff_id)
            .eq("date", dateStr)
            .maybeSingle() as any;

          if (existing) {
            await supabase
              .from("attendance_records")
              .update({ status: "on_leave" })
              .eq("id", existing.id) as any;
          } else {
            await supabase
              .from("attendance_records")
              .insert({
                staff_id: request.staff_id,
                date: dateStr,
                status: "on_leave",
              }) as any;
          }
        }

        // Check for affected tasks and show delegation dialog
        if ((request.affected_tasks_count || 0) > 0) {
          setDelegationDialog({
            open: true,
            taskCount: request.affected_tasks_count || 0,
            staffName: request.staff_name || "Staff member",
          });
        }
      }

      // Notify staff
      const { data: staffProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", request.staff_id)
        .single() as any;

      if (staffProfile) {
        await supabase.from("notifications").insert({
          user_id: staffProfile.email,
          title: mode === "approve" ? "Leave Request Approved" : "Leave Request Rejected",
          message: mode === "approve"
            ? `Your ${leaveTypeLabels[request.leave_type] || request.leave_type} request from ${request.start_date} to ${request.end_date} has been approved.${comment ? ` Comment: ${comment}` : ""}`
            : `Your leave request was rejected. Reason: ${comment}`,
          type: "hr_leave_decision",
          entity_type: "leave_request",
          entity_id: request.id,
        }) as any;
      }

      toast.success(`Leave request ${mode === "approve" ? "approved" : "rejected"}`);
      setActionDialog({ open: false, mode: "approve", request: null });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process request");
    } finally {
      setProcessing(false);
    }
  };

  const filteredHistory = history.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterMonth) {
      const reqMonth = r.start_date.substring(0, 7); // YYYY-MM
      if (reqMonth !== filterMonth) return false;
    }
    return true;
  });

  const statusBadge = (status: string) => {
    switch (status) {
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
        <h1 className="text-2xl font-bold">Leave Approvals</h1>

        {/* Pending Approvals */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pending Requests ({pending.length})</h2>
          {pending.length === 0 ? (
            <Card>
              <CardContent className="text-center text-muted-foreground py-8">
                No pending leave requests
              </CardContent>
            </Card>
          ) : (
            pending.map((req) => (
              <Card key={req.id} className="border-l-4 border-l-yellow-400">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{req.staff_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {leaveTypeLabels[req.leave_type] || req.leave_type}
                        {req.half_day_type && ` (${req.half_day_type})`}
                        {" · "}
                        {format(parseISO(req.start_date), "MMM d")}
                        {req.start_date !== req.end_date && ` – ${format(parseISO(req.end_date), "MMM d")}`}
                        {" · "}
                        {req.total_days} day{req.total_days !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(req.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>

                  {req.reason && (
                    <p className="text-sm bg-muted rounded-md p-2">{req.reason}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm">
                    {req.balance_remaining !== undefined && (
                      <span className="text-muted-foreground">
                        Balance: <strong>{req.balance_remaining}</strong> → <strong>{req.balance_remaining - req.total_days}</strong> after
                      </span>
                    )}
                  </div>

                  {(req.affected_tasks_count || 0) > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-md text-sm text-orange-800">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span>This staff has <strong>{req.affected_tasks_count}</strong> open tasks during this period</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => openActionDialog("approve", req)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openActionDialog("reject", req)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Leave History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Leave History</CardTitle>
              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-[150px] h-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No reviewed requests
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHistory.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-sm font-medium">{req.staff_name}</TableCell>
                      <TableCell className="text-sm">
                        {format(parseISO(req.start_date), "MMM d")}
                        {req.start_date !== req.end_date && ` – ${format(parseISO(req.end_date), "MMM d")}`}
                      </TableCell>
                      <TableCell className="text-sm">{leaveTypeLabels[req.leave_type] || req.leave_type}</TableCell>
                      <TableCell className="text-sm">{req.total_days}</TableCell>
                      <TableCell>{statusBadge(req.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {(req as any).admin_comment || req.rejection_reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Approve/Reject Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionDialog.mode === "approve" ? "Approve Leave" : "Reject Leave"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.mode === "approve"
                ? "Add an optional comment for the staff member."
                : "Please provide a reason for rejection."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Comment {actionDialog.mode === "reject" && <span className="text-destructive">*</span>}</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionDialog.mode === "reject" ? "Reason for rejection..." : "Optional comment..."}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionDialog.mode === "reject" && comment.trim().length < 5)}
              className={actionDialog.mode === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={actionDialog.mode === "reject" ? "destructive" : "default"}
            >
              {processing ? "Processing..." : actionDialog.mode === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegation Dialog */}
      <Dialog open={delegationDialog.open} onOpenChange={(open) => setDelegationDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              Task Delegation
            </DialogTitle>
            <DialogDescription>
              This approval affects <strong>{delegationDialog.taskCount}</strong> open tasks assigned to {delegationDialog.staffName}.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Would you like to delegate these tasks now or handle it later?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegationDialog((prev) => ({ ...prev, open: false }))}>
              Later
            </Button>
            <Button onClick={() => {
              setDelegationDialog((prev) => ({ ...prev, open: false }));
              toast.info("Delegation feature will be available in the next update.");
            }}>
              Delegate Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
