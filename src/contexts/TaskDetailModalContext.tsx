import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";

type TaskDetailModalContextValue = {
  openTask: (taskId: string) => void;
  closeTask: () => void;
  taskId: string | null;
  open: boolean;
};

const TaskDetailModalContext = createContext<TaskDetailModalContextValue | null>(null);

export function TaskDetailModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  const openTask = useCallback((id: string) => {
    setTaskId(id);
    setOpen(true);
  }, []);

  const closeTask = useCallback(() => {
    setOpen(false);
    // allow close animation to play; clear after
    window.setTimeout(() => setTaskId(null), 150);
  }, []);

  const value = useMemo(
    () => ({ openTask, closeTask, taskId, open }),
    [openTask, closeTask, taskId, open]
  );

  return (
    <TaskDetailModalContext.Provider value={value}>
      {children}
      <TaskDetailView
        taskId={taskId}
        open={open}
        onOpenChange={(o) => {
          if (!o) closeTask();
        }}
      />
    </TaskDetailModalContext.Provider>
  );
}

export function useTaskDetailModal() {
  const ctx = useContext(TaskDetailModalContext);
  if (!ctx) throw new Error("useTaskDetailModal must be used within TaskDetailModalProvider");
  return ctx;
}
