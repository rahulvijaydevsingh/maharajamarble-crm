import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EnhancedTaskTable } from "@/components/tasks/EnhancedTaskTable";
import { TaskKanbanView } from "@/components/tasks/TaskKanbanView";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
import { TaskCompletionDialog } from "@/components/tasks/TaskCompletionDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, CheckSquare, LayoutList, Kanban } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { ProfessionalDetailView } from "@/components/professionals/ProfessionalDetailView";
import { AddProfessionalDialog } from "@/components/professionals/AddProfessionalDialog";
import { useProfessionals } from "@/hooks/useProfessionals";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Tasks = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [boardTab, setBoardTab] = useState<"active" | "lost" | "recycle">("active");
  const { tasks, updateTask, addTask } = useTasks();
  const { canCreate } = usePermissions();
  const { hasRole } = useAuth();
  const showAdminTabs = hasRole("manager");

  const [selectedProfessional, setSelectedProfessional] = useState<any>(null);
  const [professionalDetailOpen, setProfessionalDetailOpen] = useState(false);
  const [profEditDialogOpen, setProfEditDialogOpen] = useState(false);
  const { professionals, deleteProfessional } = useProfessionals();
  const { toast } = useToast();

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<any>(null);

  // Get URL params for filtering
  const relatedToType = searchParams.get("related_to_type");
  const relatedToId = searchParams.get("related_to_id");
  const relatedToName = searchParams.get("related_to_name");

  // Handle ?view=reminders — surface reminders info (no dedicated reminders panel on Tasks page)
  useEffect(() => {
    const v = searchParams.get("view") || searchParams.get("tab");
    if (v === "reminders") {
      toast({
        title: "Reminders",
        description: "Use the bell icon or the Reminders widget on the Dashboard to view all reminders.",
      });
      searchParams.delete("view");
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Counts for tab badges
  const tabCounts = useMemo(() => {
    let active = 0, lost = 0, recycle = 0;
    for (const t of tasks) {
      const leadStatus = t.lead?.status;
      if (leadStatus === "deleted" || t.status === "Cancelled") recycle++;
      else if (leadStatus === "lost" || leadStatus === "pending_lost") lost++;
      else active++;
    }
    return { active, lost, recycle };
  }, [tasks]);

  // Filter kanban tasks by tab
  const kanbanTasks = useMemo(() => {
    if (boardTab === "lost") {
      return tasks.filter(t => t.lead?.status === "lost" || t.lead?.status === "pending_lost");
    }
    if (boardTab === "recycle") {
      return tasks.filter(t => t.lead?.status === "deleted" || t.status === "Cancelled");
    }
    return tasks.filter(t => t.lead?.status !== "deleted" && t.status !== "Cancelled");
  }, [tasks, boardTab]);


  const handleTaskCreate = (taskData: any) => {
    console.log("New task created:", taskData);
  };

  const handleEditTask = (task: any) => {
    setSelectedTask(task);
    setEditTaskDialogOpen(true);
  };

  const handleTaskUpdate = (updatedTaskData: any) => {
    console.log("Task updated:", updatedTaskData);
    setEditTaskDialogOpen(false);
    setSelectedTask(null);
  };

  const handleKanbanUpdate = async (id: string, updates: any) => {
    try {
      if (updates?.status === "Completed") {
        const t = tasks.find((x) => x.id === id) || null;
        if (t) {
          setTaskToComplete(t);
          setCompleteDialogOpen(true);
          return;
        }
      }
      await updateTask(id, updates);
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const handleRequestComplete = (task: any) => {
    setTaskToComplete(task);
    setCompleteDialogOpen(true);
  };

  const handleProfessionalClick = async (id: string) => {
    const found = professionals.find((p) => p.id === id) || null;
    if (found) {
      setSelectedProfessional(found);
      setProfessionalDetailOpen(true);
      return;
    }

    // Gemini Fallback: Fetch directly from Supabase if local state cache misses
    try {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSelectedProfessional(data);
        setProfessionalDetailOpen(true);
      } else {
        toast({
          title: "Professional not found",
          description: "Could not locate the requested professional profile details.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("Error fetching professional fallback details:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to load professional details from server.",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-marble-primary mb-1 flex items-center gap-2">
              <CheckSquare className="h-8 w-8" />
              Tasks
            </h1>
            <p className="text-muted-foreground">
              Manage and track all your team's tasks and follow-ups
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "kanban")}>
              <TabsList>
                <TabsTrigger value="list" className="gap-1">
                  <LayoutList className="h-4 w-4" />
                  List
                </TabsTrigger>
                <TabsTrigger value="kanban" className="gap-1">
                  <Kanban className="h-4 w-4" />
                  Kanban
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {canCreate("tasks") && (
              <Button onClick={() => setAddTaskDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Task
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Task Management</CardTitle>
            <CardDescription>
              View, filter, and manage all tasks with advanced filtering and export capabilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {viewMode === "list" ? (
              <EnhancedTaskTable 
                onEditTask={handleEditTask}
                onRequestCompleteTask={handleRequestComplete}
                initialRelatedToType={relatedToType}
                initialRelatedToId={relatedToId}
                initialRelatedToName={relatedToName}
                onProfessionalClick={handleProfessionalClick}
              />
            ) : (
              <TaskKanbanView 
                tasks={tasks} 
                onTaskUpdate={handleKanbanUpdate} 
                onEditTask={handleEditTask} 
                onRequestCompleteTask={handleRequestComplete}
              />
            )}
          </CardContent>
        </Card>

        <AddTaskDialog
          open={addTaskDialogOpen}
          onOpenChange={setAddTaskDialogOpen}
          onTaskCreate={handleTaskCreate}
        />

        {selectedTask && (
          <EditTaskDialog
            open={editTaskDialogOpen}
            onOpenChange={setEditTaskDialogOpen}
            taskData={selectedTask}
            onSave={handleTaskUpdate}
          />
        )}

        <TaskCompletionDialog
          open={completeDialogOpen}
          onOpenChange={(o) => {
            setCompleteDialogOpen(o);
            if (!o) setTaskToComplete(null);
          }}
          task={taskToComplete}
          updateTask={updateTask}
          addTask={addTask}
        />

        <ProfessionalDetailView
          professional={selectedProfessional}
          open={professionalDetailOpen}
          onOpenChange={(o) => {
            setProfessionalDetailOpen(o);
            if (!o) setSelectedProfessional(null);
          }}
          onEdit={(professional) => {
            setSelectedProfessional(professional);
            setProfessionalDetailOpen(false);
            // Deferred mount: prevents Radix hideOthers collision between
            // ProfessionalDetailView and AddProfessionalDialog closing/opening
            // in the same render tick, which leaves pointer-events:none stuck
            // on body. 200ms matches DialogContent close animation duration.
            setTimeout(() => {
              setProfEditDialogOpen(true);
            }, 200);
          }}
          onDelete={async (id) => {
            await deleteProfessional(id);
            setProfessionalDetailOpen(false);
            setSelectedProfessional(null);
          }}
        />

        <AddProfessionalDialog
          open={profEditDialogOpen}
          onOpenChange={(o) => {
            setProfEditDialogOpen(o);
            if (!o) setSelectedProfessional(null);
          }}
          editingProfessional={selectedProfessional}
        />
      </div>
    </DashboardLayout>
  );
};

export default Tasks;
