import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, Eye, RefreshCw, CalendarIcon, Archive } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface ArchivedLead {
  id: string;
  name: string;
  phone: string;
  lost_reason: string | null;
  lost_reason_notes: string | null;
  lost_at: string | null;
  lost_approved_by: string | null;
  assigned_to: string;
  cooling_off_due_date: string | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  address: string | null;
  firm_name: string | null;
}

const LOST_REASON_LABELS: Record<string, string> = {
  price_too_high: "Price Too High",
  chose_competitor: "Chose Competitor",
  project_cancelled: "Project Cancelled",
  not_responding: "Not Responding",
  not_interested: "Not Interested",
  budget_constraint: "Budget Constraint",
  duplicate: "Duplicate Lead",
  other: "Other",
};

export function LeadArchive() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<ArchivedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [reengageDateDialogOpen, setReengageDateDialogOpen] = useState(false);
  const [viewingLead, setViewingLead] = useState<ArchivedLead | null>(null);
  const [reengageLead, setReengageLead] = useState<ArchivedLead | null>(null);
  const [selectedLead, setSelectedLead] = useState<ArchivedLead | null>(null);
  const [newReengageDate, setNewReengageDate] = useState<Date | undefined>();

  const fetchArchivedLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "lost")
        .order("lost_at", { ascending: false });

      if (error) throw error;
      setLeads((data || []) as unknown as ArchivedLead[]);
    } catch (err) {
      console.error("Error fetching archived leads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchivedLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.email && l.email.toLowerCase().includes(q))
      );
    }
    if (reasonFilter !== "all") {
      result = result.filter((l) => l.lost_reason === reasonFilter);
    }
    return result;
  }, [leads, searchQuery, reasonFilter]);

  const handleReengage = async (lead: ArchivedLead) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          status: 'new',
          lost_at: null,
          lost_reason: null,
          lost_reason_notes: null,
          pending_lost_since: null,
          previous_status: null,
          cooling_off_due_date: null,
        })
        .eq('id', lead.id);

      if (error) throw error;
      toast({ title: 'Lead Re-engaged', description: `${lead.name} moved back to active leads.` });
      setReengageLead(null);
      fetchArchivedLeads();
    } catch (err: any) {
      toast({ title: 'Failed to re-engage', description: err.message, variant: 'destructive' });
    }
  };

  const handleSetReengageDate = (lead: ArchivedLead) => {
    setSelectedLead(lead);
    setNewReengageDate(lead.cooling_off_due_date ? new Date(lead.cooling_off_due_date) : undefined);
    setReengageDateDialogOpen(true);
  };

  const handleSaveReengageDate = async () => {
    if (!selectedLead || !newReengageDate) return;
    try {
      const { error } = await supabase
        .from("leads")
        .update({ cooling_off_due_date: format(newReengageDate, "yyyy-MM-dd") })
        .eq("id", selectedLead.id);

      if (error) throw error;
      toast({ title: "Re-engagement date updated" });
      setReengageDateDialogOpen(false);
      fetchArchivedLeads();
    } catch (err) {
      console.error("Error updating re-engagement date:", err);
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            {Object.entries(LOST_REASON_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No archived leads found.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="min-w-[150px]">Lead Name</TableHead>
                <TableHead className="min-w-[100px]">Phone</TableHead>
                <TableHead className="min-w-[120px]">Lost Reason</TableHead>
                <TableHead className="min-w-[100px]">Lost Date</TableHead>
                <TableHead className="min-w-[100px]">Assigned To</TableHead>
                <TableHead className="min-w-[120px]">Re-engagement Due</TableHead>
                <TableHead className="min-w-[150px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      {LOST_REASON_LABELS[lead.lost_reason || ""] || lead.lost_reason || "-"}
                    </Badge>
                    {lead.lost_reason_notes && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 text-xs text-muted-foreground cursor-help">ℹ️</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{lead.lost_reason_notes}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.lost_at
                      ? format(new Date(lead.lost_at), "dd MMM yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm">{lead.assigned_to}</TableCell>
                  <TableCell>
                    {lead.cooling_off_due_date ? (
                      <span
                        className={cn(
                          "text-sm",
                          new Date(lead.cooling_off_due_date) <= new Date()
                            ? "text-green-600 font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {format(new Date(lead.cooling_off_due_date), "dd MMM yyyy")}
                        {new Date(lead.cooling_off_due_date) <= new Date() && " ✓ Due"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setViewingLead(lead)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View Lead</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setReengageLead(lead)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Re-engage</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSetReengageDate(lead)}
                            >
                              <CalendarIcon className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Set Re-engagement Date</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* View Lead Details Dialog */}
      <Dialog open={!!viewingLead} onOpenChange={(open) => !open && setViewingLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Archived Lead Details</DialogTitle>
          </DialogHeader>
          {viewingLead && (
            <div className="grid grid-cols-2 gap-6 py-4">
              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Lead Name</Label>
                  <p className="text-sm font-medium">{viewingLead.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Phone</Label>
                  <p className="text-sm font-medium">{viewingLead.phone}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Email</Label>
                  <p className="text-sm font-medium">{viewingLead.email || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Address</Label>
                  <p className="text-sm font-medium">{viewingLead.address || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Assigned To</Label>
                  <p className="text-sm font-medium">{viewingLead.assigned_to}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Lost Reason</Label>
                  <div>
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      {LOST_REASON_LABELS[viewingLead.lost_reason || ""] || viewingLead.lost_reason || "-"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Lost Date</Label>
                  <p className="text-sm font-medium">
                    {viewingLead.lost_at ? format(new Date(viewingLead.lost_at), "PPP") : "-"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Re-engagement Due</Label>
                  <p className="text-sm font-medium">
                    {viewingLead.cooling_off_due_date ? format(new Date(viewingLead.cooling_off_due_date), "PPP") : "-"}
                  </p>
                </div>
                {viewingLead.lost_reason_notes && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">Lost Reason Notes</Label>
                    <p className="text-sm text-muted-foreground mt-1 bg-muted p-2 rounded">{viewingLead.lost_reason_notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingLead(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-engage Confirmation */}
      <AlertDialog open={!!reengageLead} onOpenChange={(open) => !open && setReengageLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-engage Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore <strong>{reengageLead?.name}</strong> to the active leads list with status <strong>New</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reengageLead && handleReengage(reengageLead)}>
              Confirm Re-engage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-engagement Date Dialog */}
      <Dialog open={reengageDateDialogOpen} onOpenChange={setReengageDateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Re-engagement Date</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Set a date to be reminded about re-engaging with{" "}
              <strong>{selectedLead?.name}</strong>.
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !newReengageDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newReengageDate ? format(newReengageDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newReengageDate}
                  onSelect={setNewReengageDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReengageDateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReengageDate} disabled={!newReengageDate}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
