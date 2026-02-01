import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useTasks, Task } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { TaskCompletionDialog } from "@/components/tasks/TaskCompletionDialog";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
import { SnoozeMenu } from "@/components/tasks/form/SnoozeMenu";
import { EntityAttachmentsTab } from "@/components/shared/EntityAttachmentsTab";
import { useTaskActivityLog } from "@/hooks/useTaskActivityLog";
import { TaskActivityTimeline } from "@/components/tasks/TaskActivityTimeline";
import { format } from "date-fns";

function ValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-right break-words">{value}</div>
    </div>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tasks, updateTask, addTask, deleteTask, snoozeTask } = useTasks();
  const { canEdit, canDelete } = usePermissions();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const taskId = id || null;

  const fromStore = useMemo(() => tasks.find((t) => t.id === taskId) || null, [tasks, taskId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!taskId) {
        setTask(null);
        setLoading(false);
        return;
      }

      // Prefer store if already loaded
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

    void load();
    return () => {
      cancelled = true;
    };
  }, [fromStore, taskId]);

  const { entries, loading: activityLoading, hasMore, loadMore } = useTaskActivityLog(taskId);

  const canEditTask = canEdit("tasks");
  const canDeleteTask = canDelete("tasks");

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/tasks")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Tasks
            </Button>
          </div>

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
            <>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold truncate">{task.title}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="outline">{task.type}</Badge>
                    <Badge variant="secondary">{task.priority}</Badge>
                    <Badge variant={task.status === "Completed" ? "secondary" : "outline"}>
                      {task.status}
                    </Badge>
                    {task.lead?.name && (
                      <Badge variant="outline">Lead: {task.lead.name}</Badge>
                    )}
                    {task.related_entity_type && task.related_entity_id && (
                      <Badge variant="outline" className="capitalize">
                        {task.related_entity_type}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCompleteOpen(true)}
                    disabled={task.status === "Completed"}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Complete
                  </Button>

                  <SnoozeMenu
                    variant="button"
                    disabled={task.status === "Completed"}
                    onSnooze={(hours) => {
                      void snoozeTask(task.id, hours);
                    }}
                  />

                  {canEditTask && (
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}

                  {canDeleteTask && (
                    <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>

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
                            <ValueRow label="Completed at" value={format(new Date(task.completed_at), "dd MMM yyyy, HH:mm")} />
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

              {editOpen && (
                <EditTaskDialog
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  taskData={task}
                  onSave={() => {
                    setEditOpen(false);
                  }}
                />
              )}

              <TaskCompletionDialog
                open={completeOpen}
                onOpenChange={(o) => {
                  setCompleteOpen(o);
                }}
                task={task}
                updateTask={updateTask}
                addTask={addTask}
              />

              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
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
                        navigate("/tasks");
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
