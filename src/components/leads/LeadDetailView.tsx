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
  XOctagon,
} from 'lucide-react';
 import { HeartHandshake } from 'lucide-react';
import { Lead, useLeads } from '@/hooks/useLeads';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useReminders } from '@/hooks/useReminders';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { SendWhatsAppDialog } from '@/components/whatsapp/SendWhatsAppDialog';
import { useWhatsAppSettings } from '@/hooks/useWhatsAppSettings';
import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';
import { MessageCircle } from 'lucide-react';
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
import { MarkAsLostDialog } from './MarkAsLostDialog';
import { PendingLostBanner } from './PendingLostBanner';
import { supabase } from '@/integrations/supabase/client';

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
  contentClassName?: string;
  overlayClassName?: string;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  'new': { label: 'New', className: 'bg-blue-100 text-blue-700' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
  'quoted': { label: 'Quoted', className: 'bg-purple-100 text-purple-700' },
  'won': { label: 'Won', className: 'bg-green-100 text-green-700' },
  'pending_lost': { label: 'Pending Approval', className: 'bg-violet-100 text-violet-700' },
  'lost': { label: 'Lost', className: 'bg-red-100 text-red-700' },
  'deleted': { label: 'Deleted', className: 'bg-gray-100 text-gray-500' },
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
  contentClassName,
  overlayClassName,
}: LeadDetailViewProps) {
  const [activeTab, setActiveTab] = useState(initialTab || 'profile');
  const [isEditing, setIsEditing] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(highlightTaskId || null);
  const [focusReminderId, setFocusReminderId] = useState<string | null>(highlightReminderId || null);
  const { leads, updateLead, refetch } = useLeads();
  const { logActivity } = useLogActivity();
  const { toast } = useToast();

  // Reminder save handler for sibling dialog
  const { addReminder } = useReminders('lead', lead?.id || '');
  const [savingReminder, setSavingReminder] = useState(false);

  const handleAddReminderSave = async (data: {
    title: string;
    description: string;
    reminder_datetime: string;
    is_recurring: boolean;
    recurrence_pattern: string | null;
    recurrence_end_date: string | null;
    assigned_to: string;
  }) => {
    if (!currentLead || savingReminder) return;
    setSavingReminder(true);
    try {
      await addReminder({
        title: data.title,
        description: data.description,
        reminder_datetime: data.reminder_datetime,
        is_recurring: data.is_recurring,
        recurrence_pattern: data.recurrence_pattern as "daily" | "weekly" | "monthly" | "yearly" | null,
        recurrence_end_date: data.recurrence_end_date,
        entity_type: 'lead',
        entity_id: currentLead.id,
        // created_by handled by DB default get_current_user_email()
        assigned_to: data.assigned_to,
      });
      setAddReminderOpen(false);
      toast({ title: "Reminder Created", description: `Reminder "${data.title}" saved for ${currentLead.name}` });
    } catch {
      // Error handled in addReminder
    } finally {
      setSavingReminder(false);
    }
  };
  
  // Lifted dialog states - rendered as siblings to avoid focus-trap conflicts
  const [addQuotationOpen, setAddQuotationOpen] = useState(false);
  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [markLostOpen, setMarkLostOpen] = useState(false);
  const [sendWAOpen, setSendWAOpen] = useState(false);
  const { user, isAdmin, role } = useAuth();
  const { settings: waSettings } = useWhatsAppSettings();
  const { session: waSession } = useWhatsAppSession();
  
  // Check if current user can delete leads
  const [canDeleteLeads, setCanDeleteLeads] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (isAdmin()) { setCanDeleteLeads(true); return; }
    supabase.from("profiles").select("can_delete_leads").eq("id", user.id).single()
      .then(({ data }) => setCanDeleteLeads(data?.can_delete_leads || false));
  }, [user]);
  
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
  }, [lead?.id, initialTab, highlightTaskId, highlightReminderId]);

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

  const handleMarkAsLost = async (reasonKey: string, notes: string) => {
    if (!currentLead) return;
    await updateLead(currentLead.id, {
      status: 'pending_lost',
      lost_reason: reasonKey,
      lost_reason_notes: notes || null,
      previous_status: currentLead.status,
    } as any);
    await supabase.from('leads').update({ pending_lost_since: new Date().toISOString() }).eq('id', currentLead.id);
    await logActivity({
      lead_id: currentLead.id, activity_type: 'status_change', activity_category: 'status_change',
      title: 'Lost Request Submitted',
      description: `Lead marked as Pending Lost. Reason: ${reasonKey}${notes ? ` — ${notes}` : ''}`,
      metadata: { old_status: currentLead.status, new_status: 'pending_lost', lost_reason: reasonKey },
    });
    await refetch();
    toast({ title: "Lost Request Submitted", description: "Awaiting manager approval." });
  };

  const handleApproveLost = async () => {
    if (!currentLead) return;
    const { data: reasonData } = await supabase.from('lead_lost_reasons').select('cooling_off_days').eq('reason_key', (currentLead as any).lost_reason || '').single();
    const coolingDays = reasonData?.cooling_off_days;
    const coolingDate = coolingDays ? new Date(Date.now() + coolingDays * 86400000).toISOString().split('T')[0] : null;
    
    await supabase.from('leads').update({
      status: 'lost',
      lost_at: new Date().toISOString(),
      lost_approved_by: user?.id || null,
      cooling_off_due_date: coolingDate,
    }).eq('id', currentLead.id);
    
    // Cancel all open tasks on this lead
    await supabase.from('tasks').update({ status: 'Completed', completion_notes: 'Cancelled — Lead marked Lost' } as any)
      .eq('lead_id', currentLead.id).not('status', 'eq', 'Completed');
    
    await logActivity({
      lead_id: currentLead.id, activity_type: 'status_change', activity_category: 'status_change',
      title: 'Lead Marked Lost — Approved',
      description: `Lead approved as Lost. Reason: ${(currentLead as any).lost_reason || 'N/A'}`,
    });
    await refetch();
    toast({ title: "Lead Marked as Lost", description: "Lead moved to archive." });
    onOpenChange(false);
  };

  const handleRejectLost = async () => {
    if (!currentLead) return;
    const prevStatus = (currentLead as any).previous_status || 'in-progress';
    await supabase.from('leads').update({
      status: prevStatus,
      pending_lost_since: null,
      lost_reason: null,
      lost_reason_notes: null,
      previous_status: null,
    }).eq('id', currentLead.id);
    
    await logActivity({
      lead_id: currentLead.id, activity_type: 'status_change', activity_category: 'status_change',
      title: 'Lost Request Rejected',
      description: `Lost request rejected. Lead returned to ${prevStatus}.`,
    });
    await refetch();
    toast({ title: "Lost Request Rejected", description: `Lead returned to active status.` });
  };

  if (!currentLead) return null;

  const statusConfig = statusStyles[currentLead.status] || { label: currentLead.status, className: 'bg-gray-100 text-gray-700' };

  // Show edit form when editing
  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`max-w-5xl h-[90vh] p-0 flex flex-col overflow-hidden z-[90] ${contentClassName || ''}`}
          overlayClassName={overlayClassName}
        >
          <VisuallyHidden>
            <DialogTitle>Edit Lead: {currentLead.name}</DialogTitle>
          </VisuallyHidden>
          <div className="flex-1 overflow-y-auto p-6">
            <EditSmartLeadForm
              key={currentLead.id}
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden z-[90] ${contentClassName || ''}`}
          overlayClassName={overlayClassName}
        >
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
              {waSettings?.module_enabled && currentLead.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSendWAOpen(true)}
                  disabled={!waSession || waSession.status !== 'connected'}
                  title={
                    !waSession || waSession.status !== 'connected'
                      ? 'Connect WhatsApp in Settings first'
                      : 'Send WhatsApp message'
                  }
                  className="text-green-600 border-green-200 hover:bg-green-50"
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  WhatsApp
                </Button>
              )}

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
                <DropdownMenuContent align="end" className="z-[100]">
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
                  {!['won', 'lost', 'deleted', 'pending_lost'].includes(currentLead.status) && (
                    <DropdownMenuItem onClick={() => setMarkLostOpen(true)}>
                      <XOctagon className="h-4 w-4 mr-2" />
                      Mark as Lost
                    </DropdownMenuItem>
                  )}
                  {onDelete && canDeleteLeads && !['deleted'].includes(currentLead.status) && (
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
              {currentLead.status === 'pending_lost' && (
                <PendingLostBanner
                  lostReason={(currentLead as any).lost_reason}
                  lostReasonNotes={(currentLead as any).lost_reason_notes}
                  pendingLostSince={(currentLead as any).pending_lost_since}
                  onApprove={handleApproveLost}
                  onReject={handleRejectLost}
                />
              )}
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
        contentClassName="z-[100]"
        overlayClassName="z-[100]"
      />

      <AddReminderDialog
        open={addReminderOpen}
        onOpenChange={setAddReminderOpen}
        onSave={handleAddReminderSave}
        entityName={currentLead.name}
        contentClassName="z-[100]"
        overlayClassName="z-[100]"
      />

      <AddTaskDialog
        contentClassName="z-[100]"
        overlayClassName="z-[100]"
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

      <MarkAsLostDialog
        open={markLostOpen}
        onOpenChange={setMarkLostOpen}
        leadName={currentLead.name}
        onSubmit={handleMarkAsLost}
      />

      {currentLead.phone && (
        <SendWhatsAppDialog
          open={sendWAOpen}
          onOpenChange={setSendWAOpen}
          recipientName={currentLead.name}
          recipientPhone={currentLead.phone}
          leadId={currentLead.id}
        />
      )}
    </>
  );
}
