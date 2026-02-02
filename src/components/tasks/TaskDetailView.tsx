import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useTasks, Task } from "@/hooks/useTasks";
import { useLeads, Lead } from "@/hooks/useLeads";
import { useCustomers, Customer } from "@/hooks/useCustomers";
import { useToast } from "@/hooks/use-toast";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

import { EntityAttachmentsTab } from "@/components/shared/EntityAttachmentsTab";
import { PhoneLink } from "@/components/shared/PhoneLink";
import { SnoozeMenu } from "@/components/tasks/form/SnoozeMenu";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
import { TaskCompletionDialog } from "@/components/tasks/TaskCompletionDialog";
import { useTaskActivityLog } from "@/hooks/useTaskActivityLog";
import { TaskActivityTimeline } from "@/components/tasks/TaskActivityTimeline";
import { LeadDetailView } from "@/components/leads/LeadDetailView";
import { CustomerDetailView } from "@/components/customers/CustomerDetailView";
import { TaskSubtasksCard } from "@/components/tasks/TaskSubtasksCard";

import { format } from "date-fns";
import { CheckCircle2, Copy, Pencil, Trash2, X } from "lucide-react";

type RelatedPerson =
  | { type: "lead"; id: string; name: string; phone: string | null }
  | { type: "customer"; id: string; name: string; phone: string | null }
  | { type: "professional"; id: string; name: string; phone: string | null }
  | null;

function ValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-right break-words">{value}</div>
    </div>
  );
}

export function TaskDetailView({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canEdit, canDelete } = usePermissions();
  const { tasks, updateTask, addTask, deleteTask, snoozeTask } = useTasks();
  const { leads } = useLeads();
  const { customers } = useCustomers();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [related, setRelated] = useState<RelatedPerson>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Related modals
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const fromStore = useMemo(
    () => (taskId ? tasks.find((t) => t.id === taskId) || null : null),
    [tasks, taskId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTask() {
      if (!open) return;
      if (!taskId) {
        setTask(null);
        setRelated(null);
        setLoading(false);
        return;
      }

      if (fromStore) {
        setTask(fromStore);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("tasks")
          .select(`*, lead:leads(id, name, phone, site_plus_code)`)
          .eq("id", taskId)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;
        setTask((data as unknown as Task) || null);
      } catch (e) {
        console.error("Failed to load task:", e);
        if (!cancelled) setTask(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTask();
    return () => {
      cancelled = true;
    };
  }, [open, taskId, fromStore]);

  useEffect(() => {
    let cancelled = false;

    async function loadRelated() {
      if (!open) return;
      if (!task) {
        setRelated(null);
        return;
      }

      if (task.related_entity_type && task.related_entity_id) {
        const relType = task.related_entity_type as "customer" | "professional" | "lead";
        const relId = task.related_entity_id;

        if (relType === "lead") {
          const leadFromStore = leads.find((l) => l.id === relId);
          if (leadFromStore) {
            setRelated({ type: "lead", id: relId, name: leadFromStore.name, phone: leadFromStore.phone || null });
            return;
          }
          const { data } = await supabase
            .from("leads")
            .select("id,name,phone")
            .eq("id", relId)
            .maybeSingle();
          if (!cancelled && data) setRelated({ type: "lead", id: data.id, name: data.name, phone: data.phone || null });
          return;
        }

        if (relType === "customer") {
          const customerFromStore = customers.find((c) => c.id === relId);
          if (customerFromStore) {
            setRelated({ type: "customer", id: relId, name: customerFromStore.name, phone: customerFromStore.phone || null });
            return;
          }
          const { data } = await supabase
            .from("customers")
            .select("id,name,phone")
            .eq("id", relId)
            .maybeSingle();
          if (!cancelled && data) setRelated({ type: "customer", id: data.id, name: data.name, phone: data.phone || null });
          return;
        }

        if (relType === "professional") {
          const { data } = await supabase
            .from("professionals")
            .select("id,name,phone")
            .eq("id", relId)
            .maybeSingle();
          if (!cancelled && data) setRelated({ type: "professional", id: data.id, name: data.name, phone: data.phone || null });
          return;
        }
      }

      if (task.lead?.id) {
        setRelated({ type: "lead", id: task.lead.id, name: task.lead.name, phone: task.lead.phone || null });
        return;
      }

      setRelated(null);
    }

    void loadRelated();
    return () => {
      cancelled = true;
    };
  }, [open, task, leads, customers]);

  const { entries, loading: activityLoading, hasMore, loadMore } = useTaskActivityLog(taskId);

  const canEditTask = canEdit("tasks");
  const canDeleteTask = canDelete("tasks");

  const openLeadDetailById = async (leadId: string) => {
    const leadFromStore = leads.find((l) => l.id === leadId);
    if (leadFromStore) {
      setSelectedLead(leadFromStore);
      setLeadDetailOpen(true);
      return;
    }

    try {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({
          title: "Lead not found",
          description: "This lead may have been converted or deleted.",
          variant: "destructive",
        });
        return;
      }
      setSelectedLead(data as unknown as Lead);
      setLeadDetailOpen(true);
    } catch (e: any) {
      console.error("Failed to fetch lead:", e);
      toast({ title: "Could not open lead", description: e?.message || "Please try again.", variant: "destructive" });
    }
  };

  const openCustomerDetailById = async (customerId: string) => {
    const customerFromStore = customers.find((c) => c.id === customerId);
    if (customerFromStore) {
      setSelectedCustomer(customerFromStore);
      setCustomerDetailOpen(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({ title: "Customer not found", description: "It may have been deleted.", variant: "destructive" });
        return;
      }
      setSelectedCustomer(data as unknown as Customer);
      setCustomerDetailOpen(true);
    } catch (e: any) {
      console.error("Failed to fetch customer:", e);
      toast({ title: "Could not open customer", description: e?.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!taskId) return;
    const url = `${window.location.origin}/tasks/${taskId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Paste it in Messages to share internally." });
    } catch {
      window.prompt("Copy task link:", url);
    }
  };

  const handleOpenRelated = () => {
    if (!related) return;
    if (related.type === "lead") {
      void openLeadDetailById(related.id);
      return;
    }
    if (related.type === "customer") {
      void openCustomerDetailById(related.id);
      return;
    }
    navigate(`/professionals?highlight=${encodeURIComponent(related.id)}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden z-[60]">
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold truncate">
                {task?.title || (loading ? "Loading…" : "Task")}
              </h2>

              {task && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="outline">{task.type}</Badge>
                  <Badge variant="secondary">{task.priority}</Badge>
                  <Badge variant={task.status === "Completed" ? "secondary" : "outline"}>{task.status}</Badge>
                </div>
              )}

              {task && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Related:</span>
                  {related ? (
                    <>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenRelated();
                        }}
                      >
                        {related.name}
                      </Button>
                      <span className="text-muted-foreground">•</span>
                      <PhoneLink
                        phone={related.phone}
                        onClick={(e) => e.stopPropagation()}
                        log={{
                          relatedEntityType: related.type,
                          relatedEntityId: related.id,
                        }}
                      />
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompleteOpen(true)}
                disabled={!task || task.status === "Completed"}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete
              </Button>

              <SnoozeMenu
                variant="button"
                disabled={!task || task.status === "Completed"}
                onSnooze={(hours) => {
                  if (!task) return;
                  void snoozeTask(task.id, hours);
                }}
              />

              {canEditTask && task && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}

              {canDeleteTask && task && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={handleShare} disabled={!taskId}>
                <Copy className="h-4 w-4 mr-2" />
                Share
              </Button>

              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading task…</div>
            ) : !task ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <div className="text-lg font-semibold">Task not found</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    It may have been deleted or you may not have access.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Task Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ValueRow label="Assigned to" value={task.assigned_to} />
                      <ValueRow
                        label="Due"
                        value={
                          <span>
                            {format(new Date(task.due_date), "dd MMM yyyy")}
                            {task.due_time ? ` • ${task.due_time}` : ""}
                          </span>
                        }
                      />

                      <ValueRow
                        label="Reminder"
                        value={
                          task.reminder ? (
                            <span>
                              On{task.reminder_time ? ` • ${task.reminder_time}` : ""}
                            </span>
                          ) : (
                            "Off"
                          )
                        }
                      />

                      <ValueRow label="Created by" value={task.created_by} />
                      <ValueRow label="Created" value={format(new Date(task.created_at), "dd MMM yyyy, HH:mm")} />
                      <ValueRow label="Updated" value={format(new Date(task.updated_at), "dd MMM yyyy, HH:mm")} />
                      {task.description && (
                        <>
                          <Separator />
                          <div>
                            <div className="text-sm text-muted-foreground">Description</div>
                            <div className="text-sm mt-1 whitespace-pre-wrap">{task.description}</div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Completion Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {task.status !== "Completed" ? (
                        <div className="text-sm text-muted-foreground">Not completed yet.</div>
                      ) : (
                        <>
                          <ValueRow label="Completion status" value={task.completion_status || "-"} />
                          <ValueRow label="Outcome" value={task.completion_outcome || "-"} />
                          <ValueRow label="Next action" value={task.next_action_type || "-"} />
                          {task.completed_at && (
                            <ValueRow
                              label="Completed at"
                              value={format(new Date(task.completed_at), "dd MMM yyyy, HH:mm")}
                            />
                          )}
                          {task.completion_notes && (
                            <>
                              <Separator />
                              <div>
                                <div className="text-sm text-muted-foreground">Notes</div>
                                <div className="text-sm mt-1 whitespace-pre-wrap">{task.completion_notes}</div>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <TaskSubtasksCard taskId={task.id} />

                  <EntityAttachmentsTab entityType="task" entityId={task.id} title="Attachments" />
                </div>

                <div className="space-y-6">
                  <TaskActivityTimeline
                    entries={entries}
                    loading={activityLoading}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {task && (
        <>
          {editOpen && (
            <EditTaskDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              taskData={task}
              onSave={() => setEditOpen(false)}
            />
          )}

          <TaskCompletionDialog
            open={completeOpen}
            onOpenChange={setCompleteOpen}
            task={task}
            updateTask={updateTask}
            addTask={addTask}
          />

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent className="z-[70]">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete task</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete “{task.title}”? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    await deleteTask(task.id);
                    onOpenChange(false);
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <LeadDetailView
        lead={selectedLead}
        open={leadDetailOpen}
        onOpenChange={(o) => {
          setLeadDetailOpen(o);
          if (!o) setSelectedLead(null);
        }}
      />

      <CustomerDetailView
        customer={selectedCustomer}
        open={customerDetailOpen}
        onOpenChange={(o) => {
          setCustomerDetailOpen(o);
          if (!o) setSelectedCustomer(null);
        }}
      />
    </>
  );
}
