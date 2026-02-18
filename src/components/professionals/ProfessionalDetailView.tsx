import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  User,
  CheckSquare,
  Paperclip,
  Bell,
  StickyNote,
  Activity,
  X,
  MoreHorizontal,
  Trash2,
  Edit,
  HeartHandshake,
  FileText,
  Plus,
  Loader2,
  Calendar,
  Clock,
  RefreshCw,
  Download,
  Share2,
} from 'lucide-react';
import { Professional, useProfessionals } from '@/hooks/useProfessionals';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';
import { EntityAttachmentsTab } from '@/components/shared/EntityAttachmentsTab';
import { KitProfileTab } from '@/components/kit/KitProfileTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneLink } from '@/components/shared/PhoneLink';
import { PlusCodeLink } from '@/components/shared/PlusCodeLink';
import { format, isPast, isToday, isTomorrow, addHours, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PROFESSIONAL_STATUSES } from '@/constants/professionalConstants';
import { useTasks } from '@/hooks/useTasks';
import { useReminders } from '@/hooks/useReminders';
import { useQuotations } from '@/hooks/useQuotations';
import { useTaskDetailModal } from '@/contexts/TaskDetailModalContext';
import { useActiveStaff } from '@/hooks/useActiveStaff';
import { getStaffDisplayName } from '@/lib/kitHelpers';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { EditTaskDialog } from '@/components/tasks/EditTaskDialog';
import { TaskCompletionDialog } from '@/components/tasks/TaskCompletionDialog';
import { AddReminderDialog } from '@/components/leads/detail-tabs/AddReminderDialog';
import { AddQuotationDialog } from '@/components/quotations/AddQuotationDialog';
import { QUOTATION_STATUSES, Quotation } from '@/types/quotation';

interface ProfessionalDetailViewProps {
  professional: Professional | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (professional: Professional) => void;
  onDelete?: (id: string) => void;
  initialTab?: string;
}

// ---- Profile Tab ----
function ProfessionalProfileTab({ professional, onEdit }: { professional: Professional; onEdit?: () => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{professional.name || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <PhoneLink phone={professional.phone} />
          </div>
          {professional.alternate_phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Alt Phone</span>
              <PhoneLink phone={professional.alternate_phone} />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{professional.email || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Firm</span>
            <span>{professional.firm_name || '-'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Professional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="capitalize">{professional.professional_type.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service Category</span>
            <span className="capitalize">{professional.service_category?.replace('_', ' ') || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="secondary" className={PROFESSIONAL_STATUSES[professional.status]?.className || ''}>
              {PROFESSIONAL_STATUSES[professional.status]?.label || professional.status}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rating</span>
            <span>{professional.rating ? `${professional.rating}/5` : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Projects</span>
            <span>{professional.total_projects || 0}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Location & Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">City</span>
            <span>{professional.city || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Address</span>
            <span className="text-right max-w-[200px]">{professional.address || '-'}</span>
          </div>
          {professional.site_plus_code && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plus Code</span>
              <PlusCodeLink plusCode={professional.site_plus_code} />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Assigned To</span>
            <span>{professional.assigned_to}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{format(new Date(professional.created_at), 'dd MMM yyyy')}</span>
          </div>
        </CardContent>
      </Card>

      {professional.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{professional.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Notes Tab ----
function ProfessionalNotesTab({ professional }: { professional: Professional }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadNotes();
  }, [professional.id]);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('related_entity_id', professional.id)
        .eq('related_entity_type', 'professional')
        .eq('activity_type', 'note')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotes(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    try {
      await supabase.from('activity_log').insert({
        related_entity_id: professional.id,
        related_entity_type: 'professional',
        activity_type: 'note',
        activity_category: 'note',
        title: 'Note Added',
        description: newNote.trim(),
        user_name: 'Current User',
      });
      setNewNote('');
      loadNotes();
      toast({ title: 'Note added' });
    } catch {
      toast({ title: 'Error adding note', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <textarea
          className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
        />
        <Button onClick={addNote} disabled={!newNote.trim()}>Add</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="py-3">
                <p className="text-sm whitespace-pre-wrap">{note.description}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(note.created_at), 'dd MMM yyyy, hh:mm a')} — {note.user_name}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Activity Tab ----
function ProfessionalActivityTab({ professional }: { professional: Professional }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [professional.id]);

  const loadActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('related_entity_id', professional.id)
        .eq('related_entity_type', 'professional')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setActivities(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading activity...</p>;
  if (activities.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <Card key={activity.id}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{activity.title}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(activity.created_at), 'dd MMM yyyy, hh:mm a')}
              </span>
            </div>
            {activity.description && (
              <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Tasks Tab (Full-featured) ----
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

function ProfessionalTasksTab({ professional }: { professional: Professional }) {
  const { openTask } = useTaskDetailModal();
  const { tasks, loading, updateTask, addTask, deleteTask, refetch } = useTasks();
  const { staffMembers } = useActiveStaff();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'completed' | 'overdue'>('all');
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<any>(null);

  const professionalTasks = useMemo(() => {
    let filtered = tasks.filter(t =>
      t.related_entity_type === 'professional' && t.related_entity_id === professional.id
    );
    switch (filter) {
      case 'open': filtered = filtered.filter(t => t.status !== 'Completed'); break;
      case 'completed': filtered = filtered.filter(t => t.status === 'Completed'); break;
      case 'overdue': filtered = filtered.filter(t => t.status !== 'Completed' && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))); break;
    }
    return filtered.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [tasks, professional.id, filter]);

  const handleComplete = async (taskId: string, isCompleted: boolean) => {
    if (isCompleted) {
      const t = tasks.find((x) => x.id === taskId) || null;
      if (t) { setTaskToComplete(t); setCompleteDialogOpen(true); }
      return;
    }
    await updateTask(taskId, { status: 'Pending', completed_at: null });
  };

  const getDueDateStyle = (dueDate: string, status: string) => {
    if (status === 'Completed') return 'text-muted-foreground';
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'text-red-600 font-medium';
    if (isToday(date)) return 'text-orange-600 font-medium';
    return '';
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
            <SelectContent className="z-[100]">
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
      ) : professionalTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{filter === 'all' ? 'No tasks yet. Create the first one!' : `No ${filter} tasks.`}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12"></TableHead>
                <TableHead className="min-w-[150px]">Title</TableHead>
                <TableHead className="min-w-[100px]">Type</TableHead>
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
              {professionalTasks.map((task) => {
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
                      <Button variant="link" className="h-auto p-0 justify-start" onClick={() => openTask(task.id)}>
                        {task.title}
                      </Button>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs whitespace-nowrap">{task.type || 'General'}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="cursor-default">{truncateText(task.description)}</span></TooltipTrigger>
                        {task.description && task.description.length > 40 && (<TooltipContent className="max-w-xs"><p>{task.description}</p></TooltipContent>)}
                      </Tooltip></TooltipProvider>
                    </TableCell>
                    <TableCell className={getDueDateStyle(task.due_date, task.status)}>
                      <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(task.due_date), 'dd MMM yyyy')}</div>
                    </TableCell>
                    <TableCell>
                      {task.due_time ? (<div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{task.due_time}</div>) : '-'}
                    </TableCell>
                    <TableCell><Badge variant="secondary" className={priorityConfig.className}>{priorityConfig.label}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className={statusConfig.className}>{statusConfig.label}</Badge></TableCell>
                    <TableCell className="text-sm">{getStaffDisplayName(task.assigned_to, staffMembers)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(task.created_at), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(task.updated_at), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedTask(task); setEditDialogOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedTask(task); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
        onTaskCreate={async () => { setAddDialogOpen(false); await refetch(); }}
        prefilledData={{
          relatedTo: {
            id: professional.id,
            name: professional.name || professional.firm_name || professional.phone,
            phone: professional.phone,
            type: 'professional' as const,
          },
        }}
      />

      {selectedTask && (
        <EditTaskDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          taskData={selectedTask}
          onSave={async () => { setEditDialogOpen(false); setSelectedTask(null); await refetch(); }}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTask?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (selectedTask) { try { await deleteTask(selectedTask.id); } catch {} finally { setDeleteDialogOpen(false); setSelectedTask(null); } }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskCompletionDialog
        open={completeDialogOpen}
        onOpenChange={(o) => { setCompleteDialogOpen(o); if (!o) setTaskToComplete(null); }}
        task={taskToComplete}
        updateTask={updateTask}
        addTask={addTask}
      />
    </div>
  );
}

// ---- Reminders Tab (Full-featured) ----
function ProfessionalRemindersTab({ professional }: { professional: Professional }) {
  const { reminders, loading, addReminder, dismissReminder, snoozeReminder, deleteReminder } = useReminders('professional', professional.id);
  const { tasks } = useTasks();
  const { openTask } = useTaskDetailModal();
  const { logActivity } = useLogActivity();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);

  const professionalTaskReminders = useMemo(() => {
    return tasks
      .filter((t) => t.related_entity_type === 'professional' && t.related_entity_id === professional.id && !!t.reminder && t.status !== 'Completed')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [tasks, professional.id]);

  const handleAddReminder = async (data: any) => {
    if (savingReminder) return;
    setSavingReminder(true);
    try {
      const result = await addReminder({
        title: data.title,
        description: data.description,
        reminder_datetime: data.reminder_datetime,
        is_recurring: data.is_recurring,
        recurrence_pattern: data.recurrence_pattern,
        recurrence_end_date: data.recurrence_end_date,
        entity_type: 'professional',
        entity_id: professional.id,
        created_by: 'Current User',
        assigned_to: data.assigned_to,
      });
      await logActivity({
        activity_type: 'reminder_created',
        activity_category: 'reminder',
        title: `Reminder Created: ${data.title}`,
        description: `Reminder set for ${format(new Date(data.reminder_datetime), 'PPP p')}`,
        metadata: { reminder_id: result?.id, reminder_title: data.title },
        related_entity_type: 'professional',
        related_entity_id: professional.id,
      });
      setAddDialogOpen(false);
    } catch {} finally { setSavingReminder(false); }
  };

  const getTimeLabel = (datetime: string) => {
    const date = new Date(datetime);
    if (isPast(date)) return 'Overdue';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d, yyyy');
  };

  const getTimeBadgeColor = (datetime: string) => {
    const date = new Date(datetime);
    if (isPast(date)) return 'bg-red-100 text-red-700';
    if (isToday(date)) return 'bg-yellow-100 text-yellow-700';
    if (isTomorrow(date)) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Reminders</h3>
        <Button onClick={() => setAddDialogOpen(true)} disabled={savingReminder}>
          <Plus className="h-4 w-4 mr-2" />
          Add Reminder
        </Button>
      </div>

      {professionalTaskReminders.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Task reminders</h4>
          {professionalTaskReminders.map((task) => (
            <div key={task.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <Button variant="link" className="h-auto p-0 font-medium" onClick={() => openTask(task.id)}>
                    {task.title}
                  </Button>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Badge variant="outline" className="text-xs">Due: {format(new Date(task.due_date), 'MMM d, yyyy')}</Badge>
                    {task.reminder_time && <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />{task.reminder_time}</Badge>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No reminders set for this professional.</p>
          <p className="text-sm mt-1">Create a reminder to get notified about follow-ups.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{reminder.title}</p>
                  {reminder.description && <p className="text-sm text-muted-foreground line-clamp-1">{reminder.description}</p>}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Badge variant="secondary" className={getTimeBadgeColor(reminder.reminder_datetime)}>{getTimeLabel(reminder.reminder_datetime)}</Badge>
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" /><span>{format(new Date(reminder.reminder_datetime), 'h:mm a')}</span></div>
                    {reminder.is_recurring && <Badge variant="outline" className="text-xs"><RefreshCw className="h-3 w-3 mr-1" />{reminder.recurrence_pattern}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => dismissReminder(reminder.id)}>Dismiss</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Snooze</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => snoozeReminder(reminder.id, addHours(new Date(), 1))}>1 hour</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => snoozeReminder(reminder.id, addHours(new Date(), 3))}>3 hours</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => snoozeReminder(reminder.id, addDays(new Date(), 1))}>Tomorrow</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => snoozeReminder(reminder.id, addDays(new Date(), 7))}>Next week</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteReminder(reminder.id)}>
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddReminderDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={handleAddReminder}
        entityName={professional.name || professional.firm_name || professional.phone}
      />
    </div>
  );
}

// ---- Quotations Tab ----
function ProfessionalQuotationsTab({ professional }: { professional: Professional }) {
  const { quotations, loading } = useQuotations();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);

  const professionalQuotations = quotations.filter(q => q.client_id === professional.id);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const getStatusStyle = (status: string) => QUOTATION_STATUSES.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700';
  const getStatusLabel = (status: string) => QUOTATION_STATUSES.find(s => s.value === status)?.label || status;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Quotations</h3>
        <Button onClick={() => { setEditQuotation(null); setAddDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Quotation
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : professionalQuotations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No quotations yet. Create the first one!</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {professionalQuotations.map((quotation) => (
                <TableRow key={quotation.id}>
                  <TableCell className="font-medium">{quotation.quotation_number}</TableCell>
                  <TableCell>{format(new Date(quotation.quotation_date), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(quotation.total)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getStatusStyle(quotation.status)}>{getStatusLabel(quotation.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><FileText className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Share2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddQuotationDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        editQuotation={editQuotation}
        prefillData={{
          client_name: professional.name || professional.firm_name || '',
          client_phone: professional.phone,
          client_email: professional.email || '',
          client_address: professional.address || '',
          client_id: professional.id,
          client_type: 'customer',
        }}
      />
    </div>
  );
}

// ---- Main Detail View ----
export function ProfessionalDetailView({
  professional,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  initialTab,
}: ProfessionalDetailViewProps) {
  const [activeTab, setActiveTab] = useState(initialTab || 'profile');
  const { professionals } = useProfessionals();

  const currentProfessional = professionals.find(p => p.id === professional?.id) || professional;

  useEffect(() => {
    if (professional) {
      setActiveTab(initialTab || 'profile');
    }
  }, [professional?.id, initialTab]);

  if (!currentProfessional) return null;

  const displayName = currentProfessional.name || currentProfessional.firm_name || currentProfessional.phone;
  const statusConfig = PROFESSIONAL_STATUSES[currentProfessional.status] || { label: currentProfessional.status, className: '' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] md:max-h-[90vh] max-h-[100dvh] overflow-hidden flex flex-col p-0 [&>button]:hidden z-[70]">
        <VisuallyHidden>
          <DialogTitle>Professional Details: {displayName}</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg md:text-xl font-semibold truncate">{displayName}</h2>
            <Badge variant="secondary" className={statusConfig.className}>{statusConfig.label}</Badge>
            <span className="text-sm text-muted-foreground capitalize hidden md:inline">
              {currentProfessional.professional_type.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(currentProfessional)}>
                <Edit className="h-4 w-4 mr-1" />
                <span className="hidden md:inline">Edit</span>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <span className="hidden md:inline">More</span>
                  <MoreHorizontal className="h-4 w-4 md:ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[80]">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(currentProfessional)}>
                    <Edit className="h-4 w-4 mr-2" />Edit Professional
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onDelete && (
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(currentProfessional.id)}>
                    <Trash2 className="h-4 w-4 mr-2" />Delete Professional
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-4 md:px-6 overflow-x-auto">
            <TabsList className="h-12 bg-transparent gap-1 md:gap-2">
              <TabsTrigger value="profile" className="gap-1.5 data-[state=active]:bg-muted">
                <User className="h-4 w-4" /><span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5 data-[state=active]:bg-muted">
                <CheckSquare className="h-4 w-4" /><span className="hidden sm:inline">Tasks</span>
              </TabsTrigger>
              <TabsTrigger value="quotations" className="gap-1.5 data-[state=active]:bg-muted">
                <FileText className="h-4 w-4" /><span className="hidden sm:inline">Quotations</span>
              </TabsTrigger>
              <TabsTrigger value="attachments" className="gap-1.5 data-[state=active]:bg-muted">
                <Paperclip className="h-4 w-4" /><span className="hidden sm:inline">Attachments</span>
              </TabsTrigger>
              <TabsTrigger value="reminders" className="gap-1.5 data-[state=active]:bg-muted">
                <Bell className="h-4 w-4" /><span className="hidden sm:inline">Reminders</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:bg-muted">
                <StickyNote className="h-4 w-4" /><span className="hidden sm:inline">Notes</span>
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5 data-[state=active]:bg-muted">
                <Activity className="h-4 w-4" /><span className="hidden sm:inline">Activity</span>
              </TabsTrigger>
              <TabsTrigger value="kit" className="gap-1.5 data-[state=active]:bg-muted">
                <HeartHandshake className="h-4 w-4" /><span className="hidden sm:inline">KIT</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="profile" className="m-0 h-full">
              <ProfessionalProfileTab professional={currentProfessional} onEdit={() => onEdit?.(currentProfessional)} />
            </TabsContent>
            <TabsContent value="tasks" className="m-0 h-full">
              <ProfessionalTasksTab professional={currentProfessional} />
            </TabsContent>
            <TabsContent value="quotations" className="m-0 h-full">
              <ProfessionalQuotationsTab professional={currentProfessional} />
            </TabsContent>
            <TabsContent value="attachments" className="m-0 h-full">
              <EntityAttachmentsTab entityType="professional" entityId={currentProfessional.id} />
            </TabsContent>
            <TabsContent value="reminders" className="m-0 h-full">
              <ProfessionalRemindersTab professional={currentProfessional} />
            </TabsContent>
            <TabsContent value="notes" className="m-0 h-full">
              <ProfessionalNotesTab professional={currentProfessional} />
            </TabsContent>
            <TabsContent value="activity" className="m-0 h-full">
              <ProfessionalActivityTab professional={currentProfessional} />
            </TabsContent>
            <TabsContent value="kit" className="m-0 h-full">
              <KitProfileTab
                entityType="professional"
                entityId={currentProfessional.id}
                entityName={displayName}
                defaultAssignee={currentProfessional.assigned_to}
                entityPhone={currentProfessional.phone || undefined}
                entityLocation={currentProfessional.site_plus_code || undefined}
                entityAddress={currentProfessional.address || undefined}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
