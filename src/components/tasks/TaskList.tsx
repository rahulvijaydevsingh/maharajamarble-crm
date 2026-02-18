import { Calendar, Check, Loader2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/useTasks";
import { useTaskDetailModal } from "@/contexts/TaskDetailModalContext";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { format, isPast, isToday } from "date-fns";

const priorities: Record<string, { label: string; className: string }> = {
  High: { label: 'High', className: 'bg-red-50 text-red-600 hover:bg-red-50' },
  Medium: { label: 'Medium', className: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-50' },
  Low: { label: 'Low', className: 'bg-green-50 text-green-600 hover:bg-green-50' },
};

export function TaskList() {
  const { tasks, loading, updateTask } = useTasks();
  const { openTask } = useTaskDetailModal();
  const navigate = useNavigate();

  const pendingTasks = useMemo(() => {
    return tasks
      .filter(task => task.status !== 'Completed')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 5);
  }, [tasks]);

  const getDueDateStyle = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'text-destructive font-medium';
    if (isToday(date)) return 'text-orange-600 font-medium';
    return '';
  };

  return (
    <Card className="marble-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium flex items-center">
            <Check className="mr-2 h-5 w-5 text-marble-accent" />
            Upcoming Tasks
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/tasks")} className="text-xs">
            View All <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendingTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No pending tasks</p>
        ) : (
          <div className="space-y-4">
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-start space-x-4 p-2 rounded-md hover:bg-muted/50">
                <Checkbox
                  id={`task-${task.id}`}
                  className="mt-0.5"
                  onCheckedChange={() => updateTask(task.id, { status: 'Completed' })}
                />
                <div className="space-y-1 flex-1 min-w-0">
                  <label
                    htmlFor={`task-${task.id}`}
                    className="font-medium cursor-pointer hover:text-primary text-sm"
                    onClick={(e) => { e.preventDefault(); openTask(task.id); }}
                  >
                    {task.title}
                  </label>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className={priorities[task.priority]?.className || ''}
                    >
                      {priorities[task.priority]?.label || task.priority}
                    </Badge>
                    <span className={`text-xs flex items-center ${getDueDateStyle(task.due_date)}`}>
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(task.due_date), 'dd MMM yyyy')}
                    </span>
                    <span className="text-xs">
                      {task.type}
                    </span>
                    <span className="text-xs truncate">
                      {task.assigned_to}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
