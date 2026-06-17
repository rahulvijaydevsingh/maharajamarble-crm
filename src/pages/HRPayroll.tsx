import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Wallet, Download, FileText, RefreshCw, ChevronDown, ChevronRight, Pencil, Plus, Minus, Lock, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";

interface SalaryRecord {
  id: string;
  staff_id: string;
  month: number;
  year: number;
  base_salary: number;
  overtime_pay: number;
  deductions: number;
  bonuses: number;
  net_salary: number;
  total_working_days: number;
  days_present: number;
  days_absent: number;
  days_leave: number;
  days_lwp: number;
  status: string;
  notes: string | null;
  manual_additions: { label: string; amount: number }[];
  manual_deductions: { label: string; amount: number }[];
  finalized_at: string | null;
  staff_name?: string;
  staff_email?: string;
}

interface AttendanceDay {
  date: string;
  status: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number;
  overtime_hours: number;
}

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function HRPayroll() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { companyData: companySettings } = useCompanySettings();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [dayBreakdown, setDayBreakdown] = useState<AttendanceDay[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // Inline edit state
  const [editDialog, setEditDialog] = useState<{ recordId: string; field: string; value: number } | null>(null);
  const [editNote, setEditNote] = useState("");

  // Manual adjustment dialog
  const [adjustDialog, setAdjustDialog] = useState<{ recordId: string; type: "add" | "deduct" } | null>(null);
  const [adjustLabel, setAdjustLabel] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("salary_records")
      .select("*")
      .eq("month", selectedMonth)
      .eq("year", selectedYear)
      .order("created_at");

    if (error) {
      console.error(error);
      setRecords([]);
      setLoading(false);
      return;
    }

    // Get staff names
    const staffIds = [...new Set((data || []).map((r: any) => r.staff_id))];
    let staffMap: Record<string, { name: string; email: string }> = {};
    if (staffIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", staffIds);
      if (profiles) {
        profiles.forEach((p: any) => {
          staffMap[p.id] = { name: p.full_name || p.email, email: p.email };
        });
      }
    }

    setRecords(
      (data || []).map((r: any) => ({
        ...r,
        manual_additions: Array.isArray(r.manual_additions) ? r.manual_additions : [],
        manual_deductions: Array.isArray(r.manual_deductions) ? r.manual_deductions : [],
        staff_name: staffMap[r.staff_id]?.name || "Unknown",
        staff_email: staffMap[r.staff_id]?.email || "",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedMonth, selectedYear]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hr-generate-salary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ month: selectedMonth, year: selectedYear }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      toast({
        title: "Payroll Generated",
        description: `${result.staff_count} staff processed. Total: ₹${result.total_payroll.toLocaleString("en-IN")}`,
      });
      fetchRecords();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const loadDayBreakdown = async (staffId: string) => {
    setBreakdownLoading(true);
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;

    const { data } = await supabase
      .from("attendance_records")
      .select("date, status, clock_in, clock_out, total_hours, overtime_hours")
      .eq("staff_id", staffId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date");

    setDayBreakdown((data || []).map((d: any) => ({ ...d, total_hours: Number(d.total_hours) || 0, overtime_hours: Number(d.overtime_hours) || 0 })));
    setBreakdownLoading(false);
  };

  const toggleRow = (recordId: string, staffId: string) => {
    if (expandedRow === recordId) {
      setExpandedRow(null);
    } else {
      setExpandedRow(recordId);
      loadDayBreakdown(staffId);
    }
  };

  const handleInlineEdit = async () => {
    if (!editDialog || !editNote.trim()) {
      toast({ title: "Note is required", variant: "destructive" });
      return;
    }
    const record = records.find((r) => r.id === editDialog.recordId);
    if (!record) return;

    const updates: any = { [editDialog.field]: editDialog.value, notes: (record.notes ? record.notes + "\n" : "") + `[Edit ${editDialog.field}]: ${editNote}` };

    // Recalculate net if base changed
    if (editDialog.field === "base_salary" || editDialog.field === "overtime_pay") {
      const base = editDialog.field === "base_salary" ? editDialog.value : record.base_salary;
      const ot = editDialog.field === "overtime_pay" ? editDialog.value : record.overtime_pay;
      const addTotal = record.manual_additions.reduce((s, a) => s + a.amount, 0);
      const dedTotal = record.manual_deductions.reduce((s, d) => s + d.amount, 0);
      updates.net_salary = base + ot + addTotal - record.deductions - dedTotal + record.bonuses;
    }

    await supabase.from("salary_records").update(updates).eq("id", editDialog.recordId);
    setEditDialog(null);
    setEditNote("");
    fetchRecords();
  };

  const handleAdjustment = async () => {
    if (!adjustDialog || !adjustLabel.trim() || !adjustAmount) return;
    const record = records.find((r) => r.id === adjustDialog.recordId);
    if (!record) return;

    const amount = Math.abs(Number(adjustAmount));
    if (adjustDialog.type === "add") {
      const newAdditions = [...record.manual_additions, { label: adjustLabel, amount }];
      const addTotal = newAdditions.reduce((s, a) => s + a.amount, 0);
      const dedTotal = record.manual_deductions.reduce((s, d) => s + d.amount, 0);
      await supabase.from("salary_records").update({
        manual_additions: newAdditions as any,
        bonuses: addTotal,
        net_salary: record.base_salary + record.overtime_pay + addTotal - record.deductions + dedTotal,
      }).eq("id", adjustDialog.recordId);
    } else {
      const newDeductions = [...record.manual_deductions, { label: adjustLabel, amount }];
      const addTotal = record.manual_additions.reduce((s, a) => s + a.amount, 0);
      const dedTotal = newDeductions.reduce((s, d) => s + d.amount, 0);
      await supabase.from("salary_records").update({
        manual_deductions: newDeductions as any,
        net_salary: record.base_salary + record.overtime_pay + addTotal - record.deductions - dedTotal,
      }).eq("id", adjustDialog.recordId);
    }

    setAdjustDialog(null);
    setAdjustLabel("");
    setAdjustAmount("");
    fetchRecords();
  };

  const handleFinalize = async () => {
    const draftIds = records.filter((r) => r.status === "draft").map((r) => r.id);
    if (draftIds.length === 0) return;
    await supabase.from("salary_records").update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: profile?.id || null,
    } as any).in("id", draftIds);
    toast({ title: "Month Finalized", description: `${draftIds.length} records locked.` });
    fetchRecords();
  };

  const exportExcel = () => {
    const data = records.map((r) => ({
      Name: r.staff_name,
      "Days Present": r.days_present,
      "Days Leave": r.days_leave,
      "Days LWP": r.days_lwp,
      "Days Absent": r.days_absent,
      "Base Salary": r.base_salary,
      "OT Pay": r.overtime_pay,
      Additions: r.bonuses,
      Deductions: r.deductions,
      "Net Salary": r.net_salary,
      Status: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `Payroll_${months[selectedMonth - 1]}_${selectedYear}.xlsx`);
  };

  const printPayslip = (record: SalaryRecord) => {
    const company = companySettings;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Payslip</title><style>
      body{font-family:Arial;padding:40px;max-width:800px;margin:auto}
      h1{text-align:center;margin-bottom:4px} .sub{text-align:center;color:#666;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin:16px 0} td,th{border:1px solid #ddd;padding:8px;text-align:left}
      .sig{margin-top:60px;border-top:1px solid #333;width:200px;text-align:center;padding-top:8px}
    </style></head><body>
    <h1>${company?.name || "Company"}</h1>
    <p class="sub">${company?.address || ""} ${company?.city || ""}</p>
    <h2>Payslip — ${months[selectedMonth - 1]} ${selectedYear}</h2>
    <p><strong>Employee:</strong> ${record.staff_name}<br/><strong>Email:</strong> ${record.staff_email}</p>
    <table><tr><th>Description</th><th>Days/Hours</th><th>Amount (₹)</th></tr>
    <tr><td>Working Days</td><td>${record.total_working_days}</td><td></td></tr>
    <tr><td>Days Present</td><td>${record.days_present}</td><td></td></tr>
    <tr><td>Days Leave (Paid)</td><td>${record.days_leave}</td><td></td></tr>
    <tr><td>Days LWP</td><td>${record.days_lwp}</td><td></td></tr>
    <tr><td>Days Absent</td><td>${record.days_absent}</td><td></td></tr>
    <tr><td><strong>Base Salary</strong></td><td></td><td>${record.base_salary.toLocaleString("en-IN")}</td></tr>
    <tr><td>Overtime Pay</td><td></td><td>${record.overtime_pay.toLocaleString("en-IN")}</td></tr>
    ${record.manual_additions.map(a => `<tr><td>${a.label}</td><td></td><td>+${a.amount.toLocaleString("en-IN")}</td></tr>`).join("")}
    ${record.manual_deductions.map(d => `<tr><td>${d.label}</td><td></td><td>-${d.amount.toLocaleString("en-IN")}</td></tr>`).join("")}
    <tr><td>Deductions (Absences)</td><td></td><td>-${record.deductions.toLocaleString("en-IN")}</td></tr>
    <tr style="font-weight:bold;background:#f5f5f5"><td>Net Salary</td><td></td><td>₹${record.net_salary.toLocaleString("en-IN")}</td></tr>
    </table>
    <div class="sig">Authorized Signatory</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const totalPayroll = records.reduce((s, r) => s + r.net_salary, 0);
  const avgSalary = records.length > 0 ? Math.round(totalPayroll / records.length) : 0;
  const allFinalized = records.length > 0 && records.every((r) => r.status === "finalized");

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Wallet className="h-7 w-7" /> Payroll
            </h1>
            <p className="text-muted-foreground">Generate, review, and export monthly payroll</p>
          </div>
          <div className="flex gap-2">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Generate Report
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Payroll</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{totalPayroll.toLocaleString("en-IN")}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Staff Count</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{records.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Average Salary</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{avgSalary.toLocaleString("en-IN")}</p></CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        {records.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-2" /> Export Excel
            </Button>
            <Button variant="outline" onClick={() => records.forEach(printPayslip)}>
              <FileText className="h-4 w-4 mr-2" /> Print All Payslips
            </Button>
            {!allFinalized && (
              <Button variant="default" onClick={handleFinalize}>
                <Lock className="h-4 w-4 mr-2" /> Finalize Month
              </Button>
            )}
          </div>
        )}

        {/* Payroll Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No payroll records. Click "Generate Report" to calculate salaries.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Staff Name</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Leave</TableHead>
                    <TableHead className="text-center">LWP</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">OT Pay</TableHead>
                    <TableHead className="text-right">Adj.</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((rec) => {
                    const isExpanded = expandedRow === rec.id;
                    const isFinalized = rec.status === "finalized";
                    const adjTotal = rec.bonuses - (rec.manual_deductions?.reduce((s, d) => s + d.amount, 0) || 0);
                    return (
                      <React.Fragment key={rec.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(rec.id, rec.staff_id)}>
                          <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="font-medium">{rec.staff_name}</TableCell>
                          <TableCell className="text-center">{rec.days_present}</TableCell>
                          <TableCell className="text-center">{rec.days_leave}</TableCell>
                          <TableCell className="text-center">{rec.days_lwp}</TableCell>
                          <TableCell className="text-center">{rec.days_absent}</TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-1">
                              ₹{rec.base_salary.toLocaleString("en-IN")}
                              {rec.notes?.includes("[Edit base_salary]") && <Pencil className="h-3 w-3 text-muted-foreground" />}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">₹{rec.overtime_pay.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-right">{adjTotal !== 0 ? `₹${adjTotal.toLocaleString("en-IN")}` : "—"}</TableCell>
                          <TableCell className="text-right font-semibold">₹{rec.net_salary.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={isFinalized ? "default" : "secondary"}>
                              {isFinalized ? "Finalized" : "Draft"}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1">
                              {!isFinalized && (
                                <>
                                  <Button size="sm" variant="ghost" title="Edit base salary" onClick={() => setEditDialog({ recordId: rec.id, field: "base_salary", value: rec.base_salary })}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" title="Add bonus" onClick={() => setAdjustDialog({ recordId: rec.id, type: "add" })}>
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" title="Add deduction" onClick={() => setAdjustDialog({ recordId: rec.id, type: "deduct" })}>
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" title="Download payslip" onClick={() => printPayslip(rec)}>
                                <FileText className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={12} className="bg-muted/30 p-4">
                              {breakdownLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : dayBreakdown.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No attendance records found for this month.</p>
                              ) : (
                                <div className="max-h-60 overflow-y-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Clock In</TableHead>
                                        <TableHead>Clock Out</TableHead>
                                        <TableHead>Hours</TableHead>
                                        <TableHead>OT</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {dayBreakdown.map((day) => (
                                        <TableRow key={day.date}>
                                          <TableCell>{format(new Date(day.date), "dd MMM")}</TableCell>
                                          <TableCell>
                                            <Badge variant={day.status === "present" ? "default" : "secondary"} className="text-xs">
                                              {day.status}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>{day.clock_in ? format(new Date(day.clock_in), "HH:mm") : "—"}</TableCell>
                                          <TableCell>{day.clock_out ? format(new Date(day.clock_out), "HH:mm") : "—"}</TableCell>
                                          <TableCell>{day.total_hours.toFixed(1)}</TableCell>
                                          <TableCell>{day.overtime_hours > 0 ? day.overtime_hours.toFixed(1) : "—"}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                              {/* Show manual adjustments */}
                              {(rec.manual_additions.length > 0 || rec.manual_deductions.length > 0) && (
                                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                                  {rec.manual_additions.length > 0 && (
                                    <div>
                                      <p className="font-medium text-green-700 dark:text-green-400 mb-1">Additions</p>
                                      {rec.manual_additions.map((a, i) => (
                                        <p key={i}>{a.label}: +₹{a.amount.toLocaleString("en-IN")}</p>
                                      ))}
                                    </div>
                                  )}
                                  {rec.manual_deductions.length > 0 && (
                                    <div>
                                      <p className="font-medium text-red-700 dark:text-red-400 mb-1">Deductions</p>
                                      {rec.manual_deductions.map((d, i) => (
                                        <p key={i}>{d.label}: -₹{d.amount.toLocaleString("en-IN")}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inline Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editDialog?.field?.replace("_", " ")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Value (₹)</Label>
              <Input type="number" value={editDialog?.value ?? ""} onChange={(e) => editDialog && setEditDialog({ ...editDialog, value: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Reason for this change..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleInlineEdit} disabled={!editNote.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={() => setAdjustDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adjustDialog?.type === "add" ? "Add Bonus / Allowance" : "Add Deduction"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input value={adjustLabel} onChange={(e) => setAdjustLabel(e.target.value)} placeholder={adjustDialog?.type === "add" ? "e.g. Performance Bonus" : "e.g. Loan Recovery"} />
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(null)}>Cancel</Button>
            <Button onClick={handleAdjustment} disabled={!adjustLabel.trim() || !adjustAmount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
