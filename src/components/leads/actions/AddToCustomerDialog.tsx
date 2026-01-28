import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { format } from "date-fns";
import { Calendar as CalendarIcon, CheckCircle, ArrowRightLeft, Link as LinkIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCustomers } from "@/hooks/useCustomers";
import { useLogActivity } from "@/hooks/useActivityLog";
import { supabase } from "@/integrations/supabase/client";

interface AddToCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadData: {
    id: string;
    name: string;
    phone?: string;
    alternate_phone?: string;
    email?: string;
    address?: string;
    assigned_to?: string;
    source?: string;
    notes?: string;
  };
  onConvert: (conversionData: any) => void;
}

type ConversionOption = 'convert_and_remove' | 'convert_and_keep';

export function AddToCustomerDialog({ open, onOpenChange, leadData }: AddToCustomerDialogProps) {
  const { staffMembers } = useActiveStaff();
  const [step, setStep] = useState(1); // 1: Conversion Options, 2: Feedback Reminder Setup
  const [conversionOption, setConversionOption] = useState<ConversionOption>('convert_and_remove');
  const [reminderData, setReminderData] = useState({
    reminderDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    reminderTypes: {
      email: true,
      task: true,
      sms: false
    },
    assignedTo: leadData.assigned_to || "",
    notes: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();
  const { addCustomer } = useCustomers();
  const { logActivity } = useLogActivity();

  const handleConfirmConversion = () => {
    setStep(2);
  };

  const performConversion = async (withReminder: boolean) => {
    setIsSubmitting(true);
    
    try {
      // Create customer record
      const customerData = {
        name: leadData.name,
        phone: leadData.phone || '',
        alternate_phone: leadData.alternate_phone || null,
        email: leadData.email || null,
        address: leadData.address || null,
        assigned_to: leadData.assigned_to || 'System',
        source: leadData.source || 'lead_conversion',
        notes: leadData.notes || null,
        created_from_lead_id: leadData.id,
        status: 'active',
        customer_type: 'individual',
        priority: 3,
      };

      const newCustomer = await addCustomer(customerData);

      if (!newCustomer) {
        throw new Error('Failed to create customer');
      }

      // Update lead based on conversion option
      if (conversionOption === 'convert_and_remove') {
        // Mark lead as converted and archived
        await supabase
          .from('leads')
          .update({
            is_converted: true,
            converted_at: new Date().toISOString(),
            converted_to_customer_id: newCustomer.id,
            status: 'won',
          })
          .eq('id', leadData.id);

        // Log activity in lead
        await logActivity({
          lead_id: leadData.id,
          activity_type: 'lead_converted',
          activity_category: 'conversion',
          title: 'Lead Converted to Customer',
          description: `Lead #${leadData.id.slice(0, 8)} - ${leadData.name} converted to customer by user. Lead data transferred successfully.`,
          metadata: {
            customer_id: newCustomer.id,
            conversion_type: 'convert_and_remove',
          },
        });
      } else {
        // Keep lead active but link to customer
        await supabase
          .from('leads')
          .update({
            converted_to_customer_id: newCustomer.id,
          })
          .eq('id', leadData.id);

        // Log activity in lead
        await logActivity({
          lead_id: leadData.id,
          activity_type: 'customer_created',
          activity_category: 'conversion',
          title: 'Customer Created from Lead',
          description: `Customer record created from lead. Lead remains active.`,
          metadata: {
            customer_id: newCustomer.id,
            conversion_type: 'convert_and_keep',
          },
        });
      }

      // Log activity in customer record
      await logActivity({
        customer_id: newCustomer.id,
        activity_type: 'customer_created',
        activity_category: 'system',
        title: 'Customer Created from Lead',
        description: `Created from lead #${leadData.id.slice(0, 8)} - ${leadData.name}`,
        metadata: {
          lead_id: leadData.id,
          conversion_type: conversionOption,
        },
      });

      // Create reminder if requested
      if (withReminder) {
        const selectedTypes = Object.entries(reminderData.reminderTypes)
          .filter(([_, selected]) => selected)
          .map(([type]) => type);

        // Create a task for feedback collection
        if (reminderData.reminderTypes.task) {
          await supabase.from('tasks').insert({
            title: `Collect feedback from ${leadData.name}`,
            description: reminderData.notes || `Follow up to collect feedback from converted customer.`,
            type: 'Follow-up Call',
            priority: 'Medium',
            status: 'Pending',
            due_date: format(reminderData.reminderDate, 'yyyy-MM-dd'),
            assigned_to: reminderData.assignedTo || 'System',
            related_entity_type: 'customer',
            related_entity_id: newCustomer.id,
          });
        }

        toast({
          title: "Conversion Successful!",
          description: `${leadData.name} converted to customer. Feedback reminder scheduled for ${format(reminderData.reminderDate, "PPP")}.`,
        });
      } else {
        toast({
          title: "Conversion Successful!",
          description: conversionOption === 'convert_and_remove' 
            ? `${leadData.name} has been converted and moved to customers.`
            : `${leadData.name} has been added to customers. Lead remains active.`,
        });
      }

      onOpenChange(false);
      setStep(1);
      setConversionOption('convert_and_remove');
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: "Error",
        description: "Failed to convert lead to customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipReminder = () => {
    performConversion(false);
  };

  const handleScheduleReminder = () => {
    const selectedTypes = Object.entries(reminderData.reminderTypes)
      .filter(([_, selected]) => selected)
      .map(([type]) => type);

    if (selectedTypes.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one reminder type.",
        variant: "destructive",
      });
      return;
    }

    if (!reminderData.assignedTo) {
      toast({
        title: "Error", 
        description: "Please assign the reminder to a team member.",
        variant: "destructive",
      });
      return;
    }

    performConversion(true);
  };

  const handleReminderTypeChange = (type: string, checked: boolean) => {
    setReminderData(prev => ({
      ...prev,
      reminderTypes: {
        ...prev.reminderTypes,
        [type]: checked
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Convert Lead to Customer</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-2">
                <ArrowRightLeft className="h-4 w-4" />
                You are converting lead "#{leadData.id.slice(0, 8)} - {leadData.name}" to a customer.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">Please choose how to proceed:</p>
              
              <RadioGroup 
                value={conversionOption} 
                onValueChange={(value) => setConversionOption(value as ConversionOption)}
                className="space-y-4"
              >
                {/* Option 1: Convert and Remove */}
                <div className={cn(
                  "relative flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                  conversionOption === 'convert_and_remove' 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-muted-foreground/50"
                )}>
                  <RadioGroupItem value="convert_and_remove" id="convert_remove" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="convert_remove" className="font-medium cursor-pointer">
                      Convert to Customer and Remove from Leads
                    </Label>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Lead will be moved to Customers
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Removed from Leads list
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        All history transferred to customer
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Lead ID will be archived
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Option 2: Convert and Keep */}
                <div className={cn(
                  "relative flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                  conversionOption === 'convert_and_keep' 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-muted-foreground/50"
                )}>
                  <RadioGroupItem value="convert_and_keep" id="convert_keep" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="convert_keep" className="font-medium cursor-pointer">
                      Convert to Customer and Keep as Lead
                    </Label>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Customer record will be created
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Lead remains active in Leads list
                      </li>
                      <li className="flex items-center gap-2">
                        <LinkIcon className="h-3 w-3 text-blue-500" />
                        Link maintained between lead & customer
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        History copied to customer record
                      </li>
                    </ul>
                  </div>
                </div>
              </RadioGroup>

              <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-muted-foreground">
                  Lead information (name, contact, address, history) will be copied to the customer record.
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmConversion}>
                Convert
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Set Up Feedback Reminder
              </DialogTitle>
              <DialogDescription>
                Schedule a feedback collection reminder for {leadData.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Reminder Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !reminderData.reminderDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reminderData.reminderDate ? format(reminderData.reminderDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={reminderData.reminderDate}
                      onSelect={(date) => date && setReminderData(prev => ({ ...prev, reminderDate: date }))}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Reminder Type</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email"
                      checked={reminderData.reminderTypes.email}
                      onCheckedChange={(checked) => handleReminderTypeChange("email", checked === true)}
                    />
                    <Label htmlFor="email" className="text-sm font-normal">Email</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="task"
                      checked={reminderData.reminderTypes.task}
                      onCheckedChange={(checked) => handleReminderTypeChange("task", checked === true)}
                    />
                    <Label htmlFor="task" className="text-sm font-normal">Task</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="sms"
                      checked={reminderData.reminderTypes.sms}
                      onCheckedChange={(checked) => handleReminderTypeChange("sms", checked === true)}
                    />
                    <Label htmlFor="sms" className="text-sm font-normal">SMS</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assigned To *</Label>
                <Select 
                  value={reminderData.assignedTo} 
                  onValueChange={(value) => setReminderData(prev => ({ ...prev, assignedTo: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((member) => (
                      <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={reminderData.notes}
                  onChange={(e) => setReminderData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any special instructions for feedback collection..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleSkipReminder} disabled={isSubmitting}>
                Skip Reminder
              </Button>
              <Button onClick={handleScheduleReminder} disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : "Schedule Reminder"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
