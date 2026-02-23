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
  FileText,
  CheckSquare,
  Paperclip,
  Bell,
  StickyNote,
  Activity,
  Printer,
  X,
  MoreHorizontal,
  UserPlus,
  Copy,
  Trash2,
  Mail,
  Download,
  Edit,
} from 'lucide-react';
 import { HeartHandshake } from 'lucide-react';
import { Lead, useLeads } from '@/hooks/useLeads';
import { useLogActivity } from '@/hooks/useActivityLog';
import { LeadProfileTab } from './detail-tabs/LeadProfileTab';
import { LeadQuotationsTab } from './detail-tabs/LeadQuotationsTab';
import { LeadTasksTab } from './detail-tabs/LeadTasksTab';
import { LeadAttachmentsTab } from './detail-tabs/LeadAttachmentsTab';
import { LeadRemindersTab } from './detail-tabs/LeadRemindersTab';
import { LeadNotesTab } from './detail-tabs/LeadNotesTab';
import { LeadActivityTab } from './detail-tabs/LeadActivityTab';
import { EditSmartLeadForm } from './EditSmartLeadForm';
import { KitProfileTab } from '@/components/kit/KitProfileTab';
import { AddQuotationDialog } from '@/components/quotations/AddQuotationDialog';
import { AddReminderDialog } from './detail-tabs/AddReminderDialog';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { KitActivationDialog } from '@/components/kit/KitActivationDialog';
import { KitPauseDialog } from '@/components/kit/KitPauseDialog';
import { KitTouchCompleteDialog } from '@/components/kit/KitTouchCompleteDialog';
import { KitCycleCompleteDialog } from '@/components/kit/KitCycleCompleteDialog';
import { AddTouchDialog } from '@/components/kit/AddTouchDialog';
import { EditTouchDialog } from '@/components/kit/EditTouchDialog';
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
import { useKitSubscriptions } from '@/hooks/useKitSubscriptions';
import { useKitTouches } from '@/hooks/useKitTouches';
import { useKitActivityLog } from '@/hooks/useKitActivityLog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useReminders } from '@/hooks/useReminders';
import { useTasks } from '@/hooks/useTasks';
import { KitTouch, KitTouchSequenceItem, KitTouchMethod } from '@/constants/kitConstants';
import { cn } from '@/lib/utils';

interface LeadDetailViewProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (lead: Lead) => void;
  onConvertToCustomer?: (lead: Lead) => void;
  onDelete?: (id: string) => void;
  initialTab?: string;
  highlightTaskId?: string | null;
  highlightReminderId?: string | null;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  'new': { label: 'New', className: 'bg-blue-100 text-blue-700' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
  'quoted': { label: 'Quoted', className: 'bg-purple-100 text-purple-700' },
  'won': { label: 'Won', className: 'bg-green-100 text-green-700' },
  'lost': { label: 'Lost', className: 'bg-red-100 text-red-700' },
};

export function LeadDetailView({
  lead,
  open,
  onOpenChange,
  onEdit,
  onConvertToCustomer,
  onDelete,
  initialTab,
  highlightTaskId,
  highlightReminderId,
}: LeadDetailViewProps) {
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setTimeout(() => {
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
      }, 100);
    }
  };

  const [activeTab, setActiveTab] = useState(initialTab || 'profile');
  const [isEditing, setIsEditing] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(highlightTaskId || null);
  const [focusReminderId, setFocusReminderId] = useState<string | null>(highlightReminderId || null);
  const { leads, updateLead, refetch } = useLeads();
  const { logActivity } = useLogActivity();
  const { user } = useAuth();
  const { addTask } = useTasks();
  const { addReminder } = useReminders();
  
  // Lifted dialog states - rendered as siblings to avoid focus-trap conflicts
  const [addQuotationOpen, setAddQuotationOpen] = useState(false);
  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  // KIT Lifted Dialog States
  const [kitActivationOpen, setKitActivationOpen] = useState(false);
  const [kitPauseOpen, setKitPauseOpen] = useState(false);
  const [kitCancelConfirmOpen, setKitCancelConfirmOpen] = useState(false);
  const [kitCompleteTouch, setKitCompleteTouch] = useState<KitTouch | null>(null);
  const [kitCycleCompleteOpen, setKitCycleCompleteOpen] = useState(false);
  const [kitAddTouchOpen, setKitAddTouchOpen] = useState(false);
  const [kitEditingTouch, setKitEditingTouch] = useState<KitTouch | null>(null);

  // KIT Hooks for lifted logic
  const {
    subscription,
    activateKit,
    pauseSubscription,
    cancelSubscription,
    createNextCycle,
    completeSubscription,
    isActivating,
    isPausing,
    isResuming,
    isCancelling,
    isCreatingCycle,
    isCompleting: isKitCompleting,
  } = useKitSubscriptions('lead', lead?.id || '');

  const {
    completeTouch,
    snoozeTouch,
    rescheduleTouch,
    addTouch,
    updateTouch,
    isCompleting: isTouchCompleting,
    isSnoozing,
    isRescheduling,
    isAdding: isTouchAdding,
    isUpdating: isTouchUpdating,
  } = useKitTouches(subscription?.id);

  const {
    logKitActivated,
    logTouchCompleted,
    logTouchSnoozed,
    logTouchRescheduled,
    logKitPaused,
    logKitCancelled,
    logCycleCompleted,
    logTouchAdded,
    logTouchEdited,
    logTaskCreatedFromKit,
    logReminderCreatedFromKit,
  } = useKitActivityLog();
  
  // Get the fresh lead data from the leads array (to ensure we have latest after refetch)
  const currentLead = leads.find(l => l.id === lead?.id) || lead;

  // Reset to profile tab when lead changes (but respect initialTab on first open)
  useEffect(() => {
    if (lead) {
      setActiveTab(initialTab || 'profile');
      setIsEditing(false);
      setFocusTaskId(highlightTaskId || null);
      setFocusReminderId(highlightReminderId || null);
    }
  }, [lead, lead?.id, initialTab, highlightTaskId, highlightReminderId]);

  // Listen for edit trigger from parent
  useEffect(() => {
    const handleTriggerEdit = (e: CustomEvent) => {
      if (e.detail?.leadId === lead?.id && open) {
        setIsEditing(true);
      }
    };
    
    window.addEventListener('triggerLeadEdit', handleTriggerEdit as EventListener);
    return () => {
      window.removeEventListener('triggerLeadEdit', handleTriggerEdit as EventListener);
    };
  }, [lead?.id, open]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = async (leadId: string, updatedData: Partial<Lead>) => {
    if (!currentLead) return;
    
    // Track which fields changed
    const changedFields: string[] = [];
    const fieldLabels: Record<string, string> = {
      name: 'Name', phone: 'Phone', alternate_phone: 'Alternate Phone', email: 'Email',
      designation: 'Designation', firm_name: 'Firm Name', site_location: 'Site Location',
      construction_stage: 'Construction Stage', estimated_quantity: 'Estimated Quantity',
      material_interests: 'Material Interests', source: 'Lead Source', assigned_to: 'Assigned To',
      priority: 'Priority', notes: 'Notes', next_follow_up: 'Next Follow-up Date',
    };
    const priorityLabels: Record<number, string> = { 1: 'Very High', 2: 'High', 3: 'Medium', 4: 'Low', 5: 'Very Low' };

    const normalizeValue = (value: any, key: string): string => {
      if (value === null || value === undefined) return '';
      if (key === 'next_follow_up' && typeof value === 'string') return value.split('T')[0];
      if (Array.isArray(value)) return JSON.stringify(value.sort());
      return String(value);
    };

    const changes: { field: string; from: string; to: string }[] = [];
    
    for (const key of Object.keys(updatedData) as (keyof typeof updatedData)[]) {
      const oldValue = currentLead[key as keyof Lead];
      const newValue = updatedData[key];
      if (normalizeValue(oldValue, key) === normalizeValue(newValue, key)) continue;
      
      changedFields.push(key);
      let fromVal: any = oldValue;
      let toVal: any = newValue;
      if (key === 'priority') {
        fromVal = priorityLabels[oldValue as number] || String(oldValue || 'Not set');
        toVal = priorityLabels[newValue as number] || String(newValue || 'Not set');
      }
      if (Array.isArray(oldValue)) fromVal = (oldValue as string[]).length > 0 ? (oldValue as string[]).join(', ') : 'None';
      if (Array.isArray(newValue)) toVal = (newValue as string[]).length > 0 ? (newValue as string[]).join(', ') : 'None';
      changes.push({ field: fieldLabels[key] || key, from: String(fromVal || 'Not set'), to: String(toVal || 'Not set') });
    }

    await updateLead(leadId, updatedData as any);
    
    if (changes.length > 0) {
      const changesDescription = changes.map(c => `${c.field}: "${c.from}" → "${c.to}"`).join('\n');
      await logActivity({
        lead_id: leadId, activity_type: 'field_update', activity_category: 'field_update',
        title: `Lead Details Updated`,
        description: `Updated ${changes.length} field(s):\n${changesDescription}`,
        metadata: { changed_fields: changedFields, changes },
      });
    }
    
    await refetch();
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  if (!currentLead) return null;

  const statusConfig = statusStyles[currentLead.status] || { label: currentLead.status, className: 'bg-gray-100 text-gray-700' };

  // KIT Logic Handlers
  const handleKitActivate = async (
    presetId: string | null,
    assignedTo: string,
    maxCycles?: number,
    customSequence?: KitTouchSequenceItem[],
    skipWeekends?: boolean,
    createTask?: boolean,
    taskTitle?: string,
    createReminder?: boolean
  ) => {
    const result = await activateKit({ entityType: 'lead', entityId: currentLead.id, presetId, assignedTo, maxCycles, customSequence, skipWeekends });
    await logKitActivated({
      entityType: 'lead',
      entityId: currentLead.id,
      entityName: currentLead.name,
      presetName: presetId || 'Custom Sequence',
      assignedTo,
    });

    if (createTask && result) {
      try {
        const subId = typeof result === 'string' ? result : (result as any)?.id;
        if (!subId) return;

        const { data: newTouches } = await supabase
          .from('kit_touches')
          .select('*')
          .eq('subscription_id', subId);

        if (newTouches) {
          for (const touch of newTouches) {
            const createdTask = await addTask({
              title: taskTitle || `KIT Touch: ${touch.method}`,
              due_date: touch.scheduled_date,
              assigned_to: touch.assigned_to,
              related_entity_type: 'lead',
              related_entity_id: currentLead.id,
            });
            if (createReminder && createdTask) {
              await addReminder({
                title: taskTitle || `KIT Reminder: ${touch.method}`,
                reminder_datetime: new Date(touch.scheduled_date).toISOString(),
                assigned_to: touch.assigned_to,
              });
            }
          }
        }
      } catch (e) { console.error(e); }
    }
  };

  const handleKitPause = async (pauseUntil?: string, pauseReason?: string) => {
    if (!subscription) return;
    await pauseSubscription({ subscriptionId: subscription.id, pauseUntil, pauseReason });
    await logKitPaused({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, pauseReason, pauseUntil });
  };

  const handleKitCancel = async () => {
    if (!subscription) return;
    await cancelSubscription(subscription.id);
    await logKitCancelled({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name });
    setKitCancelConfirmOpen(false);
  };

  const handleKitCompleteTouch = async (outcome: string, notes?: string) => {
    if (!kitCompleteTouch) return;
    const result = await completeTouch({ touchId: kitCompleteTouch.id, outcome, outcomeNotes: notes });
    await logTouchCompleted({
      entityType: 'lead',
      entityId: currentLead.id,
      entityName: currentLead.name,
      method: kitCompleteTouch.method as any,
      outcome,
      outcomeNotes: notes,
    });
    setKitCompleteTouch(null);
    if (result.cycleComplete && result.behavior === 'user_defined') setKitCycleCompleteOpen(true);
  };

  const handleKitSnoozeTouch = async (snoozeUntil: string) => {
    if (!kitCompleteTouch) return;
    await snoozeTouch({ touchId: kitCompleteTouch.id, snoozeUntil });
    await logTouchSnoozed({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, method: kitCompleteTouch.method as any, snoozeUntil });
    setKitCompleteTouch(null);
  };

  const handleKitRescheduleTouch = async (newDate: string) => {
    if (!kitCompleteTouch) return;
    await rescheduleTouch({ touchId: kitCompleteTouch.id, newDate });
    await logTouchRescheduled({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, method: kitCompleteTouch.method as any, newDate });
    setKitCompleteTouch(null);
  };

  const handleKitAddTouch = async (data: {
    method: KitTouchMethod;
    scheduledDate: string;
    assignedTo: string;
  }) => {
    if (!subscription) return;
    await addTouch({
      subscriptionId: subscription.id,
      method: data.method,
      scheduledDate: data.scheduledDate,
      assignedTo: data.assignedTo,
    });
    await logTouchAdded({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, method: data.method, scheduledDate: data.scheduledDate });
  };

  const handleKitEditTouch = async (data: {
    method: KitTouchMethod;
    scheduledDate: string;
    assignedTo: string;
  }) => {
    if (!kitEditingTouch) return;
    await updateTouch({
      touchId: kitEditingTouch.id,
      updates: { method: data.method, scheduled_date: data.scheduledDate, assigned_to: data.assignedTo },
    });
    await logTouchEdited({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, method: data.method, changes: 'Manual edit' });
  };

  const handleKitRepeatCycle = async () => {
    if (!subscription) return;
    await createNextCycle(subscription.id);
    await logCycleCompleted({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, cycleNumber: subscription.cycle_count, action: 'repeated' });
    setKitCycleCompleteOpen(false);
  };

  const handleKitStopSubscription = async () => {
    if (!subscription) return;
    await completeSubscription(subscription.id);
    await logCycleCompleted({ entityType: 'lead', entityId: currentLead.id, entityName: currentLead.name, cycleNumber: subscription.cycle_count, action: 'stopped' });
    setKitCycleCompleteOpen(false);
  };

  // Show edit form when editing
  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogOverlay className="z-[400]" />
        <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col overflow-hidden z-[401]">
          <VisuallyHidden>
            <DialogTitle>Edit Lead: {currentLead.name}</DialogTitle>
          </VisuallyHidden>
          <div className="flex-1 overflow-y-auto p-6">
            <EditSmartLeadForm
              lead={currentLead}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogOverlay className="z-[400]" />
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden z-[401]">
          <VisuallyHidden>
            <DialogTitle>Lead Details: {currentLead.name}</DialogTitle>
          </VisuallyHidden>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">
                #{currentLead.id.slice(0, 8)} - {currentLead.name}
              </h2>
              <Badge variant="secondary" className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleEditClick}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              
              {onConvertToCustomer && (
                <Button 
                  size="sm" 
                  onClick={() => onConvertToCustomer(currentLead)}
                  className="bg-primary hover:bg-primary/90"
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Convert to Customer
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    More
                    <MoreHorizontal className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[410]">
                  <DropdownMenuItem onClick={handleEditClick}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Lead
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onDelete && (
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => onDelete(currentLead.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Lead
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
                <TabsTrigger value="quotations" className="gap-1.5 data-[state=active]:bg-muted">
                  <FileText className="h-4 w-4" />
                  Quotations
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
                <LeadProfileTab 
                  lead={currentLead} 
                  onEdit={handleEditClick} 
                  onViewActivityLog={() => setActiveTab('activity')}
                />
              </TabsContent>
              
              <TabsContent value="quotations" className="m-0 h-full">
                <LeadQuotationsTab lead={currentLead} onOpenAddQuotation={() => setAddQuotationOpen(true)} />
              </TabsContent>
              
              <TabsContent value="tasks" className="m-0 h-full">
                <LeadTasksTab lead={currentLead} highlightTaskId={focusTaskId} onOpenAddTask={() => setAddTaskOpen(true)} />
              </TabsContent>
              
              <TabsContent value="attachments" className="m-0 h-full">
                <LeadAttachmentsTab lead={currentLead} />
              </TabsContent>
              
              <TabsContent value="reminders" className="m-0 h-full">
                <LeadRemindersTab lead={currentLead} highlightReminderId={focusReminderId} onOpenAddReminder={() => setAddReminderOpen(true)} />
              </TabsContent>
              
              <TabsContent value="notes" className="m-0 h-full">
                <LeadNotesTab lead={currentLead} />
              </TabsContent>
              
              <TabsContent value="activity" className="m-0 h-full">
                <LeadActivityTab 
                  lead={currentLead} 
                  onSwitchToTasksTab={(taskId) => {
                    setFocusTaskId(taskId || null);
                    setActiveTab('tasks');
                  }}
                  onSwitchToRemindersTab={(reminderId) => {
                    setFocusReminderId(reminderId || null);
                    setActiveTab('reminders');
                  }}
                />
              </TabsContent>
               
               <TabsContent value="kit" className="m-0 h-full">
                 <KitProfileTab
                   entityType="lead"
                   entityId={currentLead.id}
                   entityName={currentLead.name}
                   defaultAssignee={currentLead.assigned_to}
                   entityPhone={currentLead.phone || undefined}
                   entityLocation={currentLead.site_plus_code || undefined}
                   entityAddress={currentLead.address || undefined}
                   onOpenActivation={() => setKitActivationOpen(true)}
                   onOpenPause={() => setKitPauseOpen(true)}
                   onOpenCancelConfirm={() => setKitCancelConfirmOpen(true)}
                   onOpenCompleteTouch={setKitCompleteTouch}
                   onOpenAddTouch={() => setKitAddTouchOpen(true)}
                   onOpenEditTouch={setKitEditingTouch}
                   cycleCompleteOpen={kitCycleCompleteOpen}
                   onCycleCompleteChange={setKitCycleCompleteOpen}
                 />
               </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Child dialogs rendered as siblings - avoids Radix focus-trap conflicts */}
      <AddQuotationDialog
        open={addQuotationOpen}
        onOpenChange={setAddQuotationOpen}
        prefillData={{
          client_name: currentLead.name,
          client_phone: currentLead.phone,
          client_email: currentLead.email || '',
          client_address: currentLead.address || currentLead.site_location || '',
          client_id: currentLead.id,
          client_type: 'lead',
        }}
        contentClassName="z-[501]"
        overlayClassName="z-[500]"
      />

      <AddReminderDialog
        open={addReminderOpen}
        onOpenChange={setAddReminderOpen}
        onSave={async (data) => {
          // The reminder tab handles saving internally - just close
          setAddReminderOpen(false);
        }}
        entityName={currentLead.name}
        contentClassName="z-[501]"
        overlayClassName="z-[500]"
      />

      <AddTaskDialog
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        onTaskCreate={() => {
          setAddTaskOpen(false);
        }}
        prefilledData={{
          relatedTo: {
            id: currentLead.id,
            name: currentLead.name,
            phone: currentLead.phone,
            type: 'lead' as const,
          },
        }}
      />

      {/* KIT Lifted Dialogs */}
      <KitActivationDialog
        open={kitActivationOpen}
        onOpenChange={setKitActivationOpen}
        entityType="lead"
        entityId={currentLead.id}
        entityName={currentLead.name}
        defaultAssignee={currentLead.assigned_to}
        onActivate={handleKitActivate}
        isLoading={isActivating}
      />

      <KitPauseDialog
        open={kitPauseOpen}
        onOpenChange={setKitPauseOpen}
        onPause={handleKitPause}
        isLoading={isPausing}
      />

      <KitTouchCompleteDialog
        open={!!kitCompleteTouch}
        onOpenChange={(open) => !open && setKitCompleteTouch(null)}
        touch={kitCompleteTouch}
        entityName={currentLead.name}
        onComplete={handleKitCompleteTouch}
        onSnooze={handleKitSnoozeTouch}
        onReschedule={handleKitRescheduleTouch}
        isLoading={isTouchCompleting || isSnoozing || isRescheduling}
      />

      <KitCycleCompleteDialog
        open={kitCycleCompleteOpen}
        onOpenChange={setKitCycleCompleteOpen}
        cycleNumber={subscription?.cycle_count || 1}
        entityName={currentLead.name}
        presetName={subscription?.preset?.name || 'Custom Sequence'}
        onRepeat={handleKitRepeatCycle}
        onStop={handleKitStopSubscription}
        isLoading={isCreatingCycle || isKitCompleting}
      />

      <AddTouchDialog
        open={kitAddTouchOpen}
        onOpenChange={setKitAddTouchOpen}
        subscriptionId={subscription?.id || ''}
        entityName={currentLead.name}
        defaultAssignee={currentLead.assigned_to}
        onAdd={handleKitAddTouch}
        isLoading={isTouchAdding}
      />

      <EditTouchDialog
        open={!!kitEditingTouch}
        onOpenChange={(open) => !open && setKitEditingTouch(null)}
        touch={kitEditingTouch}
        onSave={handleKitEditTouch}
        isLoading={isTouchUpdating}
      />

      <Dialog open={kitCancelConfirmOpen} onOpenChange={setKitCancelConfirmOpen}>
        <DialogContent className="z-[501]" overlayClassName="z-[500]">
          <DialogHeader>
            <DialogTitle>Cancel Keep in Touch?</DialogTitle>
            <DialogDescription>
              This will stop all scheduled touches for {currentLead.name}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKitCancelConfirmOpen(false)}>
              Keep Active
            </Button>
            <Button
              onClick={handleKitCancel}
              variant="destructive"
            >
              {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
