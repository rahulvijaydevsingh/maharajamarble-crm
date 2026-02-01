import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, CheckSquare, Loader2, Calendar, Clock, Edit, Trash2 } from 'lucide-react';
import { Lead } from '@/hooks/useLeads';
import { useTasks } from '@/hooks/useTasks';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { EditTaskDialog } from '@/components/tasks/EditTaskDialog';
import { TaskCompletionDialog } from '@/components/tasks/TaskCompletionDialog';
import { format, isPast, isToday } from 'date-fns';

interface LeadTasksTabProps {
  lead: Lead;
  highlightTaskId?: string | null;
}

const priorityStyles: Record<string, { label: string; className: string }> = {
  'High': { label: 'High', className: 'bg-red-100 text-red-700' },
  'Medium': { label: 'Medium', className: 'bg-yellow-100 text-yellow-700' },
  'Low': { label: 'Low', className: 'bg-blue-100 text-blue-700' },
};

const statusStyles: Record<string, { label: string; className: string }> = {
  'Pending': { label: 'Pending', className: 'bg-gray-100 text-gray-700' },
  'In Progress': { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  'Completed': { label: 'Completed', className: 'bg-green-100 text-green-700' },
};

export function LeadTasksTab({ lead, highlightTaskId }: LeadTasksTabProps) {
  const navigate = useNavigate();
  const { tasks, loading, updateTask, addTask, deleteTask, refetch } = useTasks();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'completed' | 'overdue'>('all');

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<any>(null);

  // Auto-open edit dialog when highlightTaskId is provided
  React.useEffect(() => {
    if (highlightTaskId && tasks.length > 0) {
      const taskToHighlight = tasks.find(t => t.id === highlightTaskId);
      if (taskToHighlight) {
        setSelectedTask(taskToHighlight);
        setEditDialogOpen(true);
      }
    }
  }, [highlightTaskId, tasks]);

  // Filter tasks for this lead
  const leadTasks = useMemo(() => {
    let filtered = tasks.filter(t => t.lead_id === lead.id);

    switch (filter) {
      case 'open':
        filtered = filtered.filter(t => t.status !== 'Completed');
        break;
      case 'completed':
        filtered = filtered.filter(t => t.status === 'Completed');
        break;
      case 'overdue':
        filtered = filtered.filter(t => 
          t.status !== 'Completed' && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))
        );
        break;
    }

    return filtered.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [tasks, lead.id, filter]);

  const handleComplete = async (taskId: string, isCompleted: boolean) => {
    if (isCompleted) {
      const t = tasks.find((x) => x.id === taskId) || null;
      if (t) {
        setTaskToComplete(t);
        setCompleteDialogOpen(true);
      }
      return;
    }

    await updateTask(taskId, {
      status: 'Pending',
      completed_at: null,
    });
  };

  const getDueDateStyle = (dueDate: string, status: string) => {
    if (status === 'Completed') return 'text-muted-foreground';
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'text-red-600 font-medium';
    if (isToday(date)) return 'text-orange-600 font-medium';
    return '';
  };

  const handleTaskCreate = async () => {
    setAddDialogOpen(false);
    await refetch();
  };

  const handleEditClick = (task: any) => {
    setSelectedTask(task);
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    setEditDialogOpen(false);
    setSelectedTask(null);
    await refetch();
  };

  const handleDeleteClick = (task: any) => {
    setSelectedTask(task);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (selectedTask) {
      await deleteTask(selectedTask.id);
      setDeleteDialogOpen(false);
      setSelectedTask(null);
    }
  };

  const truncateText = (text: string, maxLength: number = 40) => {
    if (!text) return '-';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Tasks</h3>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : leadTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>
            {filter === 'all' 
              ? 'No tasks yet. Create the first one!' 
              : `No ${filter} tasks.`
            }
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12"></TableHead>
                <TableHead className="min-w-[150px]">Title</TableHead>
                <TableHead className="min-w-[150px]">Description</TableHead>
                <TableHead className="min-w-[100px]">Due Date</TableHead>
                <TableHead className="min-w-[80px]">Time</TableHead>
                <TableHead className="min-w-[80px]">Priority</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[100px]">Assigned To</TableHead>
                <TableHead className="min-w-[100px]">Created</TableHead>
                <TableHead className="min-w-[100px]">Updated</TableHead>
                <TableHead className="min-w-[80px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadTasks.map((task) => {
                const priorityConfig = priorityStyles[task.priority] || { label: task.priority, className: 'bg-gray-100 text-gray-700' };
                const statusConfig = statusStyles[task.status] || { label: task.status, className: 'bg-gray-100 text-gray-700' };
                
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Checkbox
                        checked={task.status === 'Completed'}
                        onCheckedChange={(checked) => handleComplete(task.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell className={task.status === 'Completed' ? 'line-through text-muted-foreground' : 'font-medium'}>
                      <Button
                        variant="link"
                        className="h-auto p-0 justify-start"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                      >
                        {task.title}
                      </Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{truncateText(task.description)}</span>
                          </TooltipTrigger>
                          {task.description && task.description.length > 40 && (
                            <TooltipContent className="max-w-xs">
                              <p>{task.description}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className={getDueDateStyle(task.due_date, task.status)}>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(task.due_date), 'dd MMM yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {task.due_time ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {task.due_time}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={priorityConfig.className}>
                        {priorityConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusConfig.className}>
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{task.assigned_to}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(task.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(task.updated_at), 'dd MMM yyyy')}
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
                                onClick={() => handleEditClick(task)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Task</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteClick(task)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete Task</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddTaskDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onTaskCreate={handleTaskCreate}
        prefilledData={{
          relatedTo: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            type: 'lead' as const,
          },
        }}
      />

      {selectedTask && (
        <EditTaskDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          taskData={selectedTask}
          onSave={handleEditSave}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTask?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}
