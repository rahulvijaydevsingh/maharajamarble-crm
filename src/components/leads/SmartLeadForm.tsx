
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

import { ContactDetailsSection, ContactPerson } from "./smart-form/ContactDetailsSection";
import { SiteDetailsSection } from "./smart-form/SiteDetailsSection";
import { SourceRelationshipSection } from "./smart-form/SourceRelationshipSection";
import { ActionTriggerSection } from "./smart-form/ActionTriggerSection";

import {
  SmartLeadFormData,
  LeadSource,
  ConstructionStage,
  FollowUpPriority,
  ProfessionalRef,
  DuplicateCheckResult,
} from "@/types/lead";
import { TEAM_MEMBERS, isProfessionalDesignation } from "@/constants/leadConstants";

interface SmartLeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (formData: SmartLeadFormData, generatedTask: any) => void;
}

export function SmartLeadForm({ open, onOpenChange, onSave }: SmartLeadFormProps) {
  const { toast } = useToast();
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
      errors.siteLocation = "Site location is required";
    }
    if (!constructionStage) {
      errors.constructionStage = "Construction stage is required";
    }
    if (materialInterests.length === 0) {
      errors.materialInterests = "At least one material interest is required";
    }
    if (materialInterests.includes("other") && !otherMaterial.trim()) {
      errors.otherMaterial = "Please specify the other material";
    }

    // Validate source & relationship
    if (!leadSource) {
      errors.leadSource = "Lead source is required";
    }
    if (leadSource === "professional_referral" && !referredBy) {
      errors.referredBy = "Referring professional is required for professional referrals";
    }
    if (!assignedTo) {
      errors.assignedTo = "Assignment is required";
    }

    // Validate action trigger
    if (!nextActionDate) {
      errors.nextActionDate = "Next action date is required";
    }
    if (!nextActionTime) {
      errors.nextActionTime = "Next action time is required";
    } else {
      const hour = parseInt(nextActionTime.split(":")[0]);
      if (hour < 9 || hour >= 19) {
        errors.nextActionTime = "Time must be during business hours (9 AM - 7 PM)";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Generate task from lead data
  const generateTask = () => {
    const assignedMember = TEAM_MEMBERS.find(m => m.id === assignedTo);
    const primaryContact = contacts[0];

    return {
      id: `task_${Date.now()}`,
      title: `First Follow-up: ${primaryContact.name}`,
      description: initialNote || "Initial follow-up for new lead",
      dueDate: nextActionDate,
      dueTime: nextActionTime,
      assignedTo: assignedMember?.name || assignedTo,
      priority: followUpPriority === "urgent" ? "high" : followUpPriority === "normal" ? "medium" : "low",
      status: "pending",
      linkedLeadId: null,
      createdAt: new Date(),
    };
  };

  // Build form data for save
  const buildFormData = (): SmartLeadFormData => {
    const primaryContact = contacts[0];
    return {
      primaryPhone: primaryContact.phone,
      leadCategory: isProfessionalDesignation(primaryContact.designation) ? "professional" : "customer",
      leadSource,
      referredBy,
      assignedTo,
      fullName: primaryContact.name,
      email: primaryContact.email,
      siteLocation,
      constructionStage,
      materialInterests: materialInterests.includes("other") && otherMaterial
        ? [...materialInterests.filter(m => m !== "other"), otherMaterial]
        : materialInterests,
      estimatedQuantity,
      firmName: primaryContact.firmName,
      gstNumber: "",
      followUpPriority,
      nextActionDate,
      nextActionTime,
      initialNote,
    };
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasDuplicateBlocking) {
      toast({
        title: "Duplicate Record",
        description: "Please resolve the duplicate before creating a new lead.",
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
      await new Promise(resolve => setTimeout(resolve, 1000));

      const generatedTask = generateTask();
      const formData = buildFormData();

      // If referred by a professional, increment their referral count
      if (referredBy) {
        console.log(`Incrementing referral count for ${referredBy.name}`);
      }

      // Notify assigned user if different from current user
      const currentUser = TEAM_MEMBERS[0].id;
      if (assignedTo !== currentUser) {
        console.log(`Sending notification to ${assignedTo}: New ${followUpPriority === "urgent" ? "Hot" : ""} Lead Assigned: Visit ${siteLocation}`);
      }

      onSave(formData, generatedTask);

      toast({
        title: "Lead Created Successfully",
        description: (
          <div className="flex flex-col gap-1">
            <span>Lead for {contacts[0].name} has been created.</span>
            <span className="text-xs text-muted-foreground">
              Task scheduled for {format(nextActionDate, "PPP")} at {nextActionTime}
            </span>
          </div>
        ),
      });

      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create lead. Please try again.",
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
            <DialogTitle className="text-xl">Smart Lead Entry</DialogTitle>
            <DialogDescription>
              Create a new lead with intelligent workflow automation. The system will auto-generate tasks and set follow-up priorities.
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
              <span>Status will be set to "New" automatically</span>
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
                "Create Lead"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
