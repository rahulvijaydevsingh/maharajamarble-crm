import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { addDays, format } from "date-fns";

import { ContactDetailsSection, ContactPerson } from "@/components/leads/smart-form/ContactDetailsSection";
import { SiteDetailsSection } from "@/components/leads/smart-form/SiteDetailsSection";
import { SourceRelationshipSection } from "@/components/leads/smart-form/SourceRelationshipSection";
import { ActionTriggerSection } from "@/components/leads/smart-form/ActionTriggerSection";

import {
  LeadSource,
  ConstructionStage,
  FollowUpPriority,
  ProfessionalRef,
  DuplicateCheckResult,
} from "@/types/lead";
import { TEAM_MEMBERS, isProfessionalDesignation } from "@/constants/leadConstants";
import { useCustomers, CustomerInsert } from "@/hooks/useCustomers";

interface SmartCustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SmartCustomerForm({ open, onOpenChange }: SmartCustomerFormProps) {
  const { toast } = useToast();
  const { addCustomer } = useCustomers();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<{ [key: string]: DuplicateCheckResult }>({});

  // Check if any duplicate is blocking
  const hasDuplicateBlocking = Object.values(duplicateResults).some(r => r.found);

  // Form state - Group 1: Contacts
  const [contacts, setContacts] = useState<ContactPerson[]>([
    {
      id: `contact_${Date.now()}`,
      designation: "owner",
      name: "",
      email: "",
      phone: "",
      alternatePhone: "",
      firmName: "",
    },
  ]);

  // Form state - Group 2: Site Details
  const [siteLocation, setSiteLocation] = useState("");
  const [sitePhotoUrl, setSitePhotoUrl] = useState<string | null>(null);
  const [sitePlusCode, setSitePlusCode] = useState<string | null>(null);
  const [constructionStage, setConstructionStage] = useState<ConstructionStage>("plastering");
  const [estimatedQuantity, setEstimatedQuantity] = useState<number | null>(null);
  const [materialInterests, setMaterialInterests] = useState<string[]>([]);
  const [otherMaterial, setOtherMaterial] = useState("");

  // Form state - Group 3: Source & Relationship
  const [leadSource, setLeadSource] = useState<LeadSource>("walk_in");
  const [assignedTo, setAssignedTo] = useState(TEAM_MEMBERS[0].id);
  const [referredBy, setReferredBy] = useState<ProfessionalRef | null>(null);

  // Form state - Group 4: Action Trigger
  const [followUpPriority, setFollowUpPriority] = useState<FollowUpPriority>("normal");
  const [nextActionDate, setNextActionDate] = useState(addDays(new Date(), 2));
  const [nextActionTime, setNextActionTime] = useState("10:00");
  const [initialNote, setInitialNote] = useState("");

  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Handle duplicate found for any phone field
  const handleDuplicateFound = useCallback((result: DuplicateCheckResult, contactKey: string) => {
    setDuplicateResults(prev => ({ ...prev, [contactKey]: result }));
  }, []);

  const handleSitePhotoChange = (photoUrl: string | null, plusCode: string | null) => {
    setSitePhotoUrl(photoUrl);
    setSitePlusCode(plusCode);
  };

  // Validation
  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    // Validate contacts
    contacts.forEach((contact, index) => {
      if (!contact.name.trim()) {
        errors[`contacts.${index}.name`] = "Name is required";
      }
      if (!contact.phone || contact.phone.length !== 10) {
        errors[`contacts.${index}.phone`] = "Valid 10-digit phone number is required";
      }
      if (contact.alternatePhone && contact.alternatePhone.length !== 10) {
        errors[`contacts.${index}.alternatePhone`] = "Invalid phone number (must be 10 digits)";
      }
      if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
        errors[`contacts.${index}.email`] = "Invalid email format";
      }
    });

    // Validate site details
    if (!siteLocation.trim()) {
      errors.siteLocation = "Address is required";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasDuplicateBlocking) {
      toast({
        title: "Duplicate Record",
        description: "Please resolve the duplicate before creating a new customer.",
        variant: "destructive",
      });
      return;
    }

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the highlighted errors before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const primaryContact = contacts[0];
      const assignedMember = TEAM_MEMBERS.find(m => m.id === assignedTo);

      const customerData: CustomerInsert = {
        name: primaryContact.name,
        phone: primaryContact.phone,
        alternate_phone: primaryContact.alternatePhone || null,
        email: primaryContact.email || null,
        company_name: primaryContact.firmName || null,
        address: siteLocation,
        city: null,
        customer_type: "individual",
        industry: null,
        status: "active",
        priority: followUpPriority === "urgent" ? 1 : followUpPriority === "normal" ? 3 : 5,
        source: leadSource,
        notes: initialNote || null,
        assigned_to: assignedMember?.name || assignedTo,
        next_follow_up: format(nextActionDate, "yyyy-MM-dd"),
        created_by: "Current User",
      };

      await addCustomer(customerData);

      toast({
        title: "Customer Created Successfully",
        description: `Customer ${primaryContact.name} has been created.`,
      });

      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setContacts([
      {
        id: `contact_${Date.now()}`,
        designation: "owner",
        name: "",
        email: "",
        phone: "",
        alternatePhone: "",
        firmName: "",
      },
    ]);
    setSiteLocation("");
    setSitePhotoUrl(null);
    setSitePlusCode(null);
    setConstructionStage("plastering");
    setEstimatedQuantity(null);
    setMaterialInterests([]);
    setOtherMaterial("");
    setLeadSource("walk_in");
    setAssignedTo(TEAM_MEMBERS[0].id);
    setReferredBy(null);
    setFollowUpPriority("normal");
    setNextActionDate(addDays(new Date(), 2));
    setNextActionTime("10:00");
    setInitialNote("");
    setValidationErrors({});
    setDuplicateResults({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="text-xl">Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer with the same form as leads. Duplicate phone number check and all validations apply.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-6 py-4 pb-6">
              {/* Group 1: Contact Details */}
              <ContactDetailsSection
                contacts={contacts}
                onContactsChange={setContacts}
                onDuplicateFound={handleDuplicateFound}
                validationErrors={validationErrors}
                duplicateResults={duplicateResults}
              />

              <Separator />

              {/* Group 2: Site Details */}
              <SiteDetailsSection
                siteLocation={siteLocation}
                sitePhotoUrl={sitePhotoUrl}
                sitePlusCode={sitePlusCode}
                constructionStage={constructionStage}
                estimatedQuantity={estimatedQuantity}
                materialInterests={materialInterests}
                otherMaterial={otherMaterial}
                onSiteLocationChange={setSiteLocation}
                onSitePhotoChange={handleSitePhotoChange}
                onConstructionStageChange={setConstructionStage}
                onEstimatedQuantityChange={setEstimatedQuantity}
                onMaterialInterestsChange={setMaterialInterests}
                onOtherMaterialChange={setOtherMaterial}
                validationErrors={validationErrors}
              />

              <Separator />

              {/* Group 3: Source & Relationship */}
              <SourceRelationshipSection
                leadSource={leadSource}
                referredBy={referredBy}
                assignedTo={assignedTo}
                onSourceChange={setLeadSource}
                onReferredByChange={setReferredBy}
                onAssignedToChange={setAssignedTo}
                validationErrors={validationErrors}
              />

              <Separator />

              {/* Group 4: Action Trigger */}
              <ActionTriggerSection
                followUpPriority={followUpPriority}
                nextActionDate={nextActionDate}
                nextActionTime={nextActionTime}
                initialNote={initialNote}
                leadSource={leadSource}
                constructionStage={constructionStage}
                onFollowUpPriorityChange={setFollowUpPriority}
                onNextActionDateChange={setNextActionDate}
                onNextActionTimeChange={setNextActionTime}
                onInitialNoteChange={setInitialNote}
                validationErrors={validationErrors}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              <CheckCircle className="h-4 w-4" />
              <span>Status will be set to "Active" automatically</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || hasDuplicateBlocking}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : hasDuplicateBlocking ? (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Duplicate Found
                </>
              ) : (
                "Create Customer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}