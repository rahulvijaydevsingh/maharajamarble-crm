import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
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
  const warned = useRef(false);

  if (!ctx) {
    // Fail-safe: don't crash the entire app if a screen renders outside the provider
    // (can happen transiently during refactors / route-level rendering).
    if (!warned.current) {
      warned.current = true;
      // eslint-disable-next-line no-console
      console.warn("useTaskDetailModal used outside TaskDetailModalProvider");
    }
    return {
      openTask: () => {},
      closeTask: () => {},
      taskId: null,
      open: false,
    } satisfies TaskDetailModalContextValue;
  }

  return ctx;
}
