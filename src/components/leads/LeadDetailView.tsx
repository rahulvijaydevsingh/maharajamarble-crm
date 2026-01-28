import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
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
  const [activeTab, setActiveTab] = useState(initialTab || 'profile');
  const [isEditing, setIsEditing] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(highlightTaskId || null);
  const [focusReminderId, setFocusReminderId] = useState<string | null>(highlightReminderId || null);
  const { leads, updateLead, refetch } = useLeads();
  const { logActivity } = useLogActivity();
  
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
      name: 'Name',
      phone: 'Phone',
      alternate_phone: 'Alternate Phone',
      email: 'Email',
      designation: 'Designation',
      firm_name: 'Firm Name',
      site_location: 'Site Location',
      construction_stage: 'Construction Stage',
      estimated_quantity: 'Estimated Quantity',
      material_interests: 'Material Interests',
      source: 'Lead Source',
      assigned_to: 'Assigned To',
      priority: 'Priority',
      notes: 'Notes',
      next_follow_up: 'Next Follow-up Date',
    };

    const priorityLabels: Record<number, string> = {
      1: 'Very High',
      2: 'High',
      3: 'Medium',
      4: 'Low',
      5: 'Very Low',
    };

    // Helper to normalize values for comparison
    const normalizeValue = (value: any, key: string): string => {
      if (value === null || value === undefined) return '';
      if (key === 'next_follow_up' && typeof value === 'string') {
        // Normalize date format - just take the date part
        return value.split('T')[0];
      }
      if (Array.isArray(value)) {
        return JSON.stringify(value.sort());
      }
      return String(value);
    };

    // Compare and build change log
    const changes: { field: string; from: string; to: string }[] = [];
    
    for (const key of Object.keys(updatedData) as (keyof typeof updatedData)[]) {
      const oldValue = currentLead[key as keyof Lead];
      const newValue = updatedData[key];
      
      const normalizedOld = normalizeValue(oldValue, key);
      const normalizedNew = normalizeValue(newValue, key);
      
      // Skip if values are the same after normalization
      if (normalizedOld === normalizedNew) continue;
      
      changedFields.push(key);
      
      let fromVal: any = oldValue;
      let toVal: any = newValue;
      
      // Format priority values
      if (key === 'priority') {
        fromVal = priorityLabels[oldValue as number] || String(oldValue || 'Not set');
        toVal = priorityLabels[newValue as number] || String(newValue || 'Not set');
      }
      
      // Format arrays
      if (Array.isArray(oldValue)) {
        fromVal = (oldValue as string[]).length > 0 ? (oldValue as string[]).join(', ') : 'None';
      }
      if (Array.isArray(newValue)) {
        toVal = (newValue as string[]).length > 0 ? (newValue as string[]).join(', ') : 'None';
      }
      
      changes.push({
        field: fieldLabels[key] || key,
        from: String(fromVal || 'Not set'),
        to: String(toVal || 'Not set'),
      });
    }

    await updateLead(leadId, updatedData as any);
    
    // Log activity if there were changes
    if (changes.length > 0) {
      const changesDescription = changes
        .map(c => `${c.field}: "${c.from}" → "${c.to}"`)
        .join('\n');
      
      await logActivity({
        lead_id: leadId,
        activity_type: 'field_update',
        activity_category: 'field_update',
        title: `Lead Details Updated`,
        description: `Updated ${changes.length} field(s):\n${changesDescription}`,
        metadata: {
          changed_fields: changedFields,
          changes: changes,
        },
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

  // Show edit form when editing
  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col overflow-hidden">
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden">
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
              <DropdownMenuContent align="end">
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
              <LeadQuotationsTab lead={currentLead} />
            </TabsContent>
            
            <TabsContent value="tasks" className="m-0 h-full">
              <LeadTasksTab lead={currentLead} highlightTaskId={focusTaskId} />
            </TabsContent>
            
            <TabsContent value="attachments" className="m-0 h-full">
              <LeadAttachmentsTab lead={currentLead} />
            </TabsContent>
            
            <TabsContent value="reminders" className="m-0 h-full">
              <LeadRemindersTab lead={currentLead} highlightReminderId={focusReminderId} />
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
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
