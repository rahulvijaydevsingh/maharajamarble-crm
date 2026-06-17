
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContactInformationSection } from "./form/ContactInformationSection";
import { LeadDetailsSection } from "./form/LeadDetailsSection";
import { StatusPrioritySection } from "./form/StatusPrioritySection";
import { AdditionalInformationSection } from "./form/AdditionalInformationSection";
import { useLeadForm } from "@/hooks/useLeadForm";
import { AddLeadDialogProps } from "@/types/lead";
import { MATERIALS } from "@/constants/leadConstants";

export function AddLeadDialog({ onAddLead }: AddLeadDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const {
    // State
    duplicateCheck,
    setDuplicateCheck,
    duplicateWarning,
    customSource,
    setCustomSource,
    showCustomSource,
    setShowCustomSource,
    validationErrors,
    setValidationErrors,
    isSubmitting,
    setIsSubmitting,
    phoneFields,
    setPhoneFields,
    formData,
    setFormData,
    
    // Functions
    validatePhone,
    formatPhone,
    validateEmail,
    checkForDuplicates,
    validateForm,
    resetForm,
  } = useLeadForm();

  // Phone field management
  const addPhoneField = () => {
    if (phoneFields.length < 4) {
      const newField = {
        id: `phone${phoneFields.length + 1}`,
        value: "",
        isValid: true,
        error: ""
      };
      setPhoneFields([...phoneFields, newField]);
    }
  };

  const removePhoneField = (id: string) => {
    if (phoneFields.length > 1) {
      setPhoneFields(phoneFields.filter(field => field.id !== id));
    }
  };

  const handlePhoneChange = (id: string, value: string) => {
    const formattedValue = formatPhone(value);
    const validation = validatePhone(formattedValue);
    
    setPhoneFields(phoneFields.map(field => 
      field.id === id 
        ? { ...field, value: formattedValue, isValid: validation.isValid, error: validation.error }
        : field
    ));

    if (duplicateCheck && formattedValue.length === 10) {
      checkForDuplicates(formattedValue, "phone");
    }
  };

  // Input handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: "" }));
    }

    if (name === "email" && duplicateCheck && value) {
      const emailTimeout = setTimeout(() => {
        if (validateEmail(value)) {
          checkForDuplicates(value, "email");
        }
      }, 2000);
      return () => clearTimeout(emailTimeout);
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (name === "source") {
      setShowCustomSource(value === "other");
    }
    
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleInterestChange = (material: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      interests: checked 
        ? [...prev.interests, material]
        : prev.interests.filter(m => m !== material)
    }));
    
    if (validationErrors.interests) {
      setValidationErrors(prev => ({ ...prev, interests: "" }));
    }
  };

  const handleSelectAllInterests = () => {
    setFormData(prev => ({ ...prev, interests: MATERIALS }));
  };

  const handleClearAllInterests = () => {
    setFormData(prev => ({ ...prev, interests: [] }));
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please correct the errors before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const newLead = {
        id: `LEAD-${Date.now()}`,
        name: formData.name,
        phone: phoneFields[0].value,
        phone2: phoneFields[1]?.value || null,
        phone3: phoneFields[2]?.value || null,
        phone4: phoneFields[3]?.value || null,
        email: formData.email,
        source: showCustomSource ? customSource : formData.source,
        interests: formData.interests,
        notes: formData.notes,
        address: formData.address,
        status: formData.status,
        assignedTo: formData.assignedTo,
        priority: formData.priority,
        nextAction: formData.nextAction,
        nextActionDateTime: `${formData.nextActionDate} ${formData.nextActionTime}`,
        createdAt: new Date().toISOString(),
      };
      
      const taskData = {
        id: `TASK-${Date.now()}`,
        title: `${formData.nextAction} - ${formData.name}`,
        description: `Auto-generated task for lead: ${formData.name}`,
        assignedTo: formData.assignedTo,
        priority: formData.priority,
        dueDate: `${formData.nextActionDate} ${formData.nextActionTime}`,
        status: "Pending",
        type: formData.nextAction,
        leadId: newLead.id,
      };
      
      console.log("Creating new lead:", newLead);
      console.log("Creating associated task:", taskData);
      
      if (onAddLead) {
        onAddLead(newLead);
      }
      
      toast({
        title: "Lead Added Successfully",
        description: `New lead ${formData.name} has been added with associated task.`,
      });
      
      resetForm();
      setOpen(false);
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full md:w-auto">
          <UserPlus className="mr-2 h-4 w-4" />
          Add New Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>
              Enter the details of the new lead. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <ContactInformationSection
              formData={formData}
              phoneFields={phoneFields}
              validationErrors={validationErrors}
              duplicateCheck={duplicateCheck}
              duplicateWarning={duplicateWarning}
              onInputChange={handleInputChange}
              onPhoneChange={handlePhoneChange}
              onAddPhoneField={addPhoneField}
              onRemovePhoneField={removePhoneField}
              onDuplicateCheckChange={setDuplicateCheck}
              validateEmail={validateEmail}
            />

            <LeadDetailsSection
              formData={formData}
              validationErrors={validationErrors}
              showCustomSource={showCustomSource}
              customSource={customSource}
              onSelectChange={handleSelectChange}
              onInterestChange={handleInterestChange}
              onCustomSourceChange={setCustomSource}
              onSelectAllInterests={handleSelectAllInterests}
              onClearAllInterests={handleClearAllInterests}
            />

            <StatusPrioritySection
              formData={formData}
              validationErrors={validationErrors}
              onSelectChange={handleSelectChange}
              onInputChange={handleInputChange}
            />

            <AdditionalInformationSection
              formData={formData}
              onInputChange={handleInputChange}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding Lead..." : "Add Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
