import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Professional, useProfessionals } from '@/hooks/useProfessionals';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';
import { EntityAttachmentsTab } from '@/components/shared/EntityAttachmentsTab';
import { KitProfileTab } from '@/components/kit/KitProfileTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneLink } from '@/components/shared/PhoneLink';
import { PlusCodeLink } from '@/components/shared/PlusCodeLink';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PROFESSIONAL_STATUSES } from '@/constants/professionalConstants';

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

// ---- Tasks Tab ----
function ProfessionalTasksTab({ professional }: { professional: Professional }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [professional.id]);

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('related_entity_id', professional.id)
        .eq('related_entity_type', 'professional')
        .order('due_date', { ascending: true });
      if (error) throw error;
      setTasks(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading tasks...</p>;
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">No tasks found.</p>;

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Card key={task.id}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{task.title}</span>
                <Badge variant="secondary" className="ml-2 text-xs">{task.status}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Due: {task.due_date ? format(new Date(task.due_date), 'dd MMM yyyy') : '-'}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Reminders Tab ----
function ProfessionalRemindersTab({ professional }: { professional: Professional }) {
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReminders();
  }, [professional.id]);

  const loadReminders = async () => {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('entity_id', professional.id)
        .eq('entity_type', 'professional')
        .order('reminder_datetime', { ascending: true });
      if (error) throw error;
      setReminders(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading reminders...</p>;
  if (reminders.length === 0) return <p className="text-sm text-muted-foreground">No reminders found.</p>;

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => (
        <Card key={reminder.id}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{reminder.title}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(reminder.reminder_datetime), 'dd MMM yyyy, hh:mm a')}
              </span>
            </div>
            {reminder.description && (
              <p className="text-sm text-muted-foreground mt-1">{reminder.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden z-[70]">
        <VisuallyHidden>
          <DialogTitle>Professional Details: {displayName}</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">
              {displayName}
            </h2>
            <Badge variant="secondary" className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
            <span className="text-sm text-muted-foreground capitalize">
              {currentProfessional.professional_type.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(currentProfessional)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  More
                  <MoreHorizontal className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[80]">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(currentProfessional)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Professional
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onDelete && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete(currentProfessional.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Professional
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
          <div className="border-b px-6">
            <TabsList className="h-12 bg-transparent gap-2">
              <TabsTrigger value="profile" className="gap-1.5 data-[state=active]:bg-muted">
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5 data-[state=active]:bg-muted">
                <CheckSquare className="h-4 w-4" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="attachments" className="gap-1.5 data-[state=active]:bg-muted">
                <Paperclip className="h-4 w-4" />
                Attachments
              </TabsTrigger>
              <TabsTrigger value="reminders" className="gap-1.5 data-[state=active]:bg-muted">
                <Bell className="h-4 w-4" />
                Reminders
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:bg-muted">
                <StickyNote className="h-4 w-4" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5 data-[state=active]:bg-muted">
                <Activity className="h-4 w-4" />
                Activity Log
              </TabsTrigger>
              <TabsTrigger value="kit" className="gap-1.5 data-[state=active]:bg-muted">
                <HeartHandshake className="h-4 w-4" />
                Keep in Touch
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="profile" className="m-0 h-full">
              <ProfessionalProfileTab professional={currentProfessional} onEdit={() => onEdit?.(currentProfessional)} />
            </TabsContent>

            <TabsContent value="tasks" className="m-0 h-full">
              <ProfessionalTasksTab professional={currentProfessional} />
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
