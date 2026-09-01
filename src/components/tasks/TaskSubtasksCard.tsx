import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubtasksSection } from "@/components/tasks/form/SubtasksSection";
import { useSubtasks } from "@/hooks/useSubtasks";
import { LeadBrief } from "@/components/tasks/LeadBrief";

export function TaskSubtasksCard({ taskId }: { taskId: string }) {
  const {
    subtasks,
    loading,
    addSubtask,
    updateSubtask,
    deleteSubtask,
  } = useSubtasks(taskId);

  return (
    <>
      <LeadBrief taskId={taskId} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Subtasks</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading subtasks…</div>
          ) : (
            <SubtasksSection
              subtasks={subtasks}
              onAddSubtask={(title) => void addSubtask({ task_id: taskId, title })}
              onUpdateSubtask={(id, updates) => void updateSubtask(id, updates)}
              onDeleteSubtask={(id) => void deleteSubtask(id)}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
