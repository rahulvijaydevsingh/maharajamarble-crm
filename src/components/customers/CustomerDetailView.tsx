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
  Loader2,
} from 'lucide-react';
import { Customer, useCustomers } from '@/hooks/useCustomers';
import { useLeads } from '@/hooks/useLeads';
import { CustomerProfileTab } from './detail-tabs/CustomerProfileTab';
import { CustomerQuotationsTab } from './detail-tabs/CustomerQuotationsTab';
import { CustomerTasksTab } from './detail-tabs/CustomerTasksTab';
import { CustomerAttachmentsTab } from './detail-tabs/CustomerAttachmentsTab';
import { CustomerRemindersTab } from './detail-tabs/CustomerRemindersTab';
import { CustomerNotesTab } from './detail-tabs/CustomerNotesTab';
import { CustomerActivityTab } from './detail-tabs/CustomerActivityTab';
import { EditSmartCustomerForm } from './EditSmartCustomerForm';
import { CUSTOMER_STATUSES } from '@/constants/customerConstants';
import { useToast } from '@/hooks/use-toast';

interface CustomerDetailViewProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (customer: Customer) => void;
  onCreateLead?: (customer: Customer) => void;
  onDelete?: (id: string) => void;
  initialEditMode?: boolean;
}

export function CustomerDetailView({
  customer,
  open,
  onOpenChange,
  onEdit,
  onCreateLead,
  onDelete,
  initialEditMode = false,
}: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [convertingToLead, setConvertingToLead] = useState(false);
  const { updateCustomer, refetch } = useCustomers();
  const { addLead } = useLeads();
  const { toast } = useToast();

  const handleConvertToLead = async () => {
    if (!customer) return;
    
    setConvertingToLead(true);
    try {
      await addLead({
        name: customer.name,
        phone: customer.phone,
        alternate_phone: customer.alternate_phone,
        email: customer.email,
        firm_name: customer.company_name,
        address: customer.address,
        source: 'customer_conversion',
        assigned_to: customer.assigned_to,
        priority: customer.priority,
        notes: `Converted from customer: ${customer.name}${customer.notes ? '\n\nOriginal notes: ' + customer.notes : ''}`,
        created_by: customer.created_by,
      });
      
      toast({
        title: "Lead Created",
        description: `Successfully created lead from customer "${customer.name}"`,
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to convert customer to lead",
        variant: "destructive",
      });
    } finally {
      setConvertingToLead(false);
    }
  };

  useEffect(() => {
    if (customer) {
      setActiveTab('profile');
      setIsEditing(initialEditMode);
    }
  }, [customer?.id, initialEditMode]);

  useEffect(() => {
    const handleTriggerEdit = (e: CustomEvent) => {
      if (e.detail?.customerId === customer?.id && open) {
        setIsEditing(true);
      }
    };
    
    window.addEventListener('triggerCustomerEdit', handleTriggerEdit as EventListener);
    return () => {
      window.removeEventListener('triggerCustomerEdit', handleTriggerEdit as EventListener);
    };
  }, [customer?.id, open]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = async (customerId: string, updatedData: Partial<Customer>) => {
    await updateCustomer(customerId, updatedData as any);
    await refetch();
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  if (!customer) return null;

  const statusConfig = CUSTOMER_STATUSES[customer.status] || { label: customer.status, className: 'bg-gray-100 text-gray-700' };

  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            <EditSmartCustomerForm
              customer={customer}
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
              #{customer.id.slice(0, 8)} - {customer.name}
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
            
            <Button 
              size="sm" 
              onClick={handleConvertToLead}
              disabled={convertingToLead}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {convertingToLead ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-1" />
              )}
              Convert to Lead
            </Button>
            
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
                  Edit Customer
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
                    onClick={() => onDelete(customer.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Customer
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
              <CustomerProfileTab 
                customer={customer} 
                onEdit={handleEditClick} 
                onViewActivityLog={() => setActiveTab('activity')}
              />
            </TabsContent>
            
            <TabsContent value="quotations" className="m-0 h-full">
              <CustomerQuotationsTab customer={customer} />
            </TabsContent>
            
            <TabsContent value="tasks" className="m-0 h-full">
              <CustomerTasksTab customer={customer} />
            </TabsContent>
            
            <TabsContent value="attachments" className="m-0 h-full">
              <CustomerAttachmentsTab customer={customer} />
            </TabsContent>
            
            <TabsContent value="reminders" className="m-0 h-full">
              <CustomerRemindersTab customer={customer} />
            </TabsContent>
            
            <TabsContent value="notes" className="m-0 h-full">
              <CustomerNotesTab customer={customer} />
            </TabsContent>
            
            <TabsContent value="activity" className="m-0 h-full">
              <CustomerActivityTab customer={customer} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
