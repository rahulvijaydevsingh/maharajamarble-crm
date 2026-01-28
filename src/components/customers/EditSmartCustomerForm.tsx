import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ArrowLeft } from "lucide-react";
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
} from "@/types/lead";
import { TEAM_MEMBERS } from "@/constants/leadConstants";
import { Customer } from "@/hooks/useCustomers";

interface EditSmartCustomerFormProps {
  customer: Customer;
  onSave: (customerId: string, updatedData: Partial<Customer>) => Promise<void>;
  onCancel: () => void;
}

export function EditSmartCustomerForm({ customer, onSave, onCancel }: EditSmartCustomerFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state - Group 1: Contacts
  const [contacts, setContacts] = useState<ContactPerson[]>([]);

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

  // Initialize form with customer data
  useEffect(() => {
    if (customer) {
      // Set primary contact from customer data
      setContacts([
        {
          id: `contact_${Date.now()}`,
          designation: "owner",
          name: customer.name,
          email: customer.email || "",
          phone: customer.phone,
          alternatePhone: customer.alternate_phone || "",
          firmName: customer.company_name || "",
        },
      ]);

      // Set site details
      setSiteLocation(customer.address || "");

      // Set source & relationship
      setLeadSource((customer.source as LeadSource) || "walk_in");
      const memberMatch = TEAM_MEMBERS.find(m => m.name === customer.assigned_to);
      setAssignedTo(memberMatch?.id || TEAM_MEMBERS[0].id);

      // Set action trigger
      setFollowUpPriority(
        customer.priority === 1 ? "urgent" : customer.priority <= 3 ? "normal" : "low"
      );
      setNextActionDate(customer.next_follow_up ? new Date(customer.next_follow_up) : addDays(new Date(), 2));
      setInitialNote(customer.notes || "");
    }
  }, [customer]);

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

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

      const updatedData: Partial<Customer> = {
        name: primaryContact.name,
        phone: primaryContact.phone,
        alternate_phone: primaryContact.alternatePhone || null,
        email: primaryContact.email || null,
        company_name: primaryContact.firmName || null,
        address: siteLocation,
        source: leadSource,
        assigned_to: assignedMember?.name || assignedTo,
        priority: followUpPriority === "urgent" ? 1 : followUpPriority === "normal" ? 3 : 5,
        notes: initialNote || null,
        next_follow_up: format(nextActionDate, "yyyy-MM-dd"),
      };

      await onSave(customer.id, updatedData);

      toast({
        title: "Customer Updated",
        description: `${primaryContact.name}'s information has been updated.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Edit Customer Details</h2>
          <p className="text-sm text-muted-foreground">
            Update information for {customer.name}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Group 1: Contact Details */}
            <ContactDetailsSection
              contacts={contacts}
              onContactsChange={setContacts}
              onDuplicateFound={() => {}}
              validationErrors={validationErrors}
              duplicateResults={{}}
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
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t mt-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="h-4 w-4" />
            <span>Changes will be saved immediately</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}