import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, User, GripVertical, Clock, Phone, LinkIcon } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import { Task } from "@/hooks/useTasks";
import { PhoneLink } from "@/components/shared/PhoneLink";

interface TaskKanbanViewProps {
  tasks: Task[];
  onTaskUpdate: (id: string, updates: Partial<Task>) => void;
  onEditTask: (task: Task) => void;
  onRequestCompleteTask?: (task: Task) => void;
}

const KANBAN_FIELDS = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assigned_to", label: "Assigned To" },
  { value: "type", label: "Task Type" },
];

const STATUS_OPTIONS = ["Pending", "In Progress", "Completed", "Overdue"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const TYPE_OPTIONS = ["Follow-up Call", "Sample Delivery", "Site Visit", "Quotation Prep", "Feedback Collection", "General"];

const statusLabels: Record<string, string> = {
  Pending: "Pending",
  "In Progress": "In Progress",
  Completed: "Completed",
  Overdue: "Overdue",
};

const priorityLabels: Record<string, string> = {
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

const statusColors: Record<string, string> = {
  Pending: "bg-blue-100 border-blue-300",
  "In Progress": "bg-yellow-100 border-yellow-300",
  Completed: "bg-green-100 border-green-300",
  Overdue: "bg-red-100 border-red-300",
};

const priorityColors: Record<string, string> = {
  High: "bg-red-100 border-red-300",
  Medium: "bg-yellow-100 border-yellow-300",
  Low: "bg-green-100 border-green-300",
};

export function TaskKanbanView({ tasks, onTaskUpdate, onEditTask, onRequestCompleteTask }: TaskKanbanViewProps) {
  const [groupBy, setGroupBy] = useState("status");
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  // Transform tasks to include computed status
  const transformedTasks = useMemo(() => {
    return tasks.map(task => {
      let computedStatus = task.status;
      if (task.status !== 'Completed' && task.due_date) {
        const dueDate = parseISO(task.due_date);
        if (isPast(dueDate) && !isToday(dueDate)) {
          computedStatus = 'Overdue';
        }
      }
      return { ...task, computedStatus };
    });
  }, [tasks]);

  // Get unique column values based on groupBy field
  const columns = useMemo(() => {
    if (groupBy === "status") return STATUS_OPTIONS;
    if (groupBy === "priority") return PRIORITY_OPTIONS;
    if (groupBy === "type") return TYPE_OPTIONS;
    
    const uniqueValues = new Set<string>();
    transformedTasks.forEach((task) => {
      const value = task[groupBy as keyof Task];
      if (value !== null && value !== undefined) {
        uniqueValues.add(String(value));
      }
    });
    return Array.from(uniqueValues).sort();
  }, [transformedTasks, groupBy]);

  // Group tasks by selected field
  const groupedTasks = useMemo(() => {
    const groups: Record<string, (Task & { computedStatus: string })[]> = {};
    columns.forEach((col) => {
      groups[col] = [];
    });
    
    transformedTasks.forEach((task) => {
      let value = "";
      if (groupBy === "status") {
        value = task.computedStatus;
      } else {
        value = String(task[groupBy as keyof Task] || "");
      }
      
      if (groups[value]) {
        groups[value].push(task);
      } else {
        // Put in first column if value doesn't match
        if (columns.length > 0 && groups[columns[0]]) {
          groups[columns[0]]?.push(task);
        }
      }
    });
    
    return groups;
  }, [transformedTasks, groupBy, columns]);

  const getColumnLabel = (value: string) => {
    if (groupBy === "status") return statusLabels[value] || value;
    if (groupBy === "priority") return priorityLabels[value] || value;
    return value || "Unassigned";
  };

  const getColumnColor = (value: string) => {
    if (groupBy === "status") return statusColors[value] || "bg-gray-50 border-gray-200";
    if (groupBy === "priority") return priorityColors[value] || "bg-gray-50 border-gray-200";
    return "bg-gray-50 border-gray-200";
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    if (!draggedTask) return;
    
    const currentValue = groupBy === "status" 
      ? (draggedTask as any).computedStatus 
      : String(draggedTask[groupBy as keyof Task]);
    
    if (currentValue !== targetColumn) {
      // Enforce completion dialog when moving to Completed
      if (groupBy === "status" && targetColumn === "Completed" && onRequestCompleteTask) {
        onRequestCompleteTask(draggedTask);
        setDraggedTask(null);
        return;
      }

      const updates: Partial<Task> = {};
      
      if (groupBy === "status") {
        updates.status = targetColumn;
      } else if (groupBy === "priority") {
        updates.priority = targetColumn;
      } else if (groupBy === "assigned_to") {
        updates.assigned_to = targetColumn;
      } else if (groupBy === "type") {
        updates.type = targetColumn;
      }
      
      onTaskUpdate(draggedTask.id, updates);
    }
    setDraggedTask(null);
  };

  return (
    <div className="space-y-4">
      {/* Group By Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Group by:</span>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KANBAN_FIELDS.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column}
            className="flex-shrink-0 w-[300px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column)}
          >
            <Card className={`h-full ${getColumnColor(column)}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>{getColumnLabel(column)}</span>
                  <Badge variant="secondary" className="ml-2">
                    {groupedTasks[column]?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                {groupedTasks[column]?.map((task) => (
                  <Card
                    key={task.id}
                    className="cursor-pointer hover:shadow-md transition-shadow bg-background"
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onClick={() => onEditTask(task)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{task.title}</div>
                          
                          {task.lead && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <LinkIcon className="h-3 w-3" />
                              <span className="truncate">{task.lead.name}</span>
                            </div>
                          )}
                          
                          {task.lead?.phone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <PhoneLink phone={task.lead.phone} className="text-xs" onClick={(e) => e.stopPropagation()} />
                            </div>
                          )}
                          
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                task.priority === "High" ? "border-red-300 text-red-600" :
                                task.priority === "Low" ? "border-green-300 text-green-600" :
                                "border-yellow-300 text-yellow-600"
                              }`}
                            >
                              {task.priority}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {task.type}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>{task.assigned_to}</span>
                            </div>
                            {task.due_date && (
                              <div className={`flex items-center gap-1 ${
                                task.computedStatus === 'Overdue' ? 'text-red-600' : ''
                              }`}>
                                <Clock className="h-3 w-3" />
                                <span>{format(new Date(task.due_date), "MMM d")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!groupedTasks[column] || groupedTasks[column].length === 0) && (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    No tasks
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
