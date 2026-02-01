import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
  }, [id]);

  return (
    <DashboardLayout>
      <div className="h-full">
        <TaskDetailView
          taskId={id || null}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) navigate("/tasks");
          }}
        />
      </div>
    </DashboardLayout>
  );
}
