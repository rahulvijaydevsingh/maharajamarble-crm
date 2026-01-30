import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ArrowLeft, Sliders } from "lucide-react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";

import { ContactDetailsSection, ContactPerson } from "./smart-form/ContactDetailsSection";
import { SiteDetailsSection } from "./smart-form/SiteDetailsSection";
import { SourceRelationshipSection } from "./smart-form/SourceRelationshipSection";
import { ActionTriggerSection } from "./smart-form/ActionTriggerSection";

import {
  LeadSource,
  ConstructionStage,
  FollowUpPriority,
  ProfessionalRef,
} from "@/types/lead";
import { isProfessionalDesignation } from "@/constants/leadConstants";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { Lead } from "@/hooks/useLeads";

// Priority levels for manual override
const PRIORITY_LEVELS = [
  { value: 1, label: "Very High", color: "bg-red-500" },
  { value: 2, label: "High", color: "bg-orange-500" },
  { value: 3, label: "Medium", color: "bg-yellow-500" },
  { value: 4, label: "Low", color: "bg-blue-500" },
  { value: 5, label: "Very Low", color: "bg-gray-500" },
];

interface EditSmartLeadFormProps {
  lead: Lead;
  onSave: (leadId: string, updatedData: Partial<Lead>) => Promise<void>;
  onCancel: () => void;
}

export function EditSmartLeadForm({ lead, onSave, onCancel }: EditSmartLeadFormProps) {
  const { toast } = useToast();
  const { staffMembers } = useActiveStaff();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state - Group 1: Contacts
  const [contacts, setContacts] = useState<ContactPerson[]>([]);

  // Form state - Group 2: Site Details
  const [siteLocation, setSiteLocation] = useState("");
  const [sitePhotoUrl, setSitePhotoUrl] = useState<string | null>(null);
  const [sitePlusCode, setSitePlusCode] = useState<string | null>(null);
  const [constructionStage, setConstructionStage] = useState<ConstructionStage | null>(null);
  const [estimatedQuantity, setEstimatedQuantity] = useState<number | null>(null);
  const [materialInterests, setMaterialInterests] = useState<string[]>([]);
  const [otherMaterial, setOtherMaterial] = useState("");

  // Form state - Group 3: Source & Relationship
  const [leadSource, setLeadSource] = useState<LeadSource | null>(null);
  const [assignedTo, setAssignedTo] = useState("");
  const [referredBy, setReferredBy] = useState<ProfessionalRef | null>(null);

  // Form state - Group 4: Action Trigger
  const [followUpPriority, setFollowUpPriority] = useState<FollowUpPriority>("normal");
  const [nextActionDate, setNextActionDate] = useState(addDays(new Date(), 2));
  const [nextActionTime, setNextActionTime] = useState("10:00");
  const [initialNote, setInitialNote] = useState("");
  
  // Priority override - allows manual priority selection (1-5 scale)
  const [useManualPriority, setUseManualPriority] = useState(false);
  const [manualPriority, setManualPriority] = useState<number>(lead?.priority ?? 3);

  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Initialize form with lead data
  useEffect(() => {
    if (lead) {
      // Set primary contact from lead data
      setContacts([
        {
          id: `contact_${Date.now()}`,
          designation: lead.designation || "owner",
          name: lead.name,
          email: lead.email || "",
          phone: lead.phone,
          alternatePhone: lead.alternate_phone || "",
          firmName: lead.firm_name || "",
        },
      ]);

      // Set site details
      setSiteLocation(lead.site_location || lead.address || "");
      setSitePhotoUrl(lead.site_photo_url || null);
      setSitePlusCode(lead.site_plus_code || null);
      // Use the actual value from the lead, don't default
      setConstructionStage(lead.construction_stage as ConstructionStage || null);
      setEstimatedQuantity(lead.estimated_quantity || null);
      setMaterialInterests((lead.material_interests as string[]) || []);

      // Set source & relationship - use actual value
      setLeadSource(lead.source as LeadSource || null);
      // Map stored name -> staff id (fallback to stored string so the select can still show it)
      const match = staffMembers.find(m => m.name === lead.assigned_to);
      setAssignedTo(match?.id || lead.assigned_to || "");
      
      // Handle referred_by which could be JSON
      if (lead.referred_by && typeof lead.referred_by === 'object' && !Array.isArray(lead.referred_by)) {
        const ref = lead.referred_by as Record<string, unknown>;
        if (ref.id && ref.name && ref.firmName && ref.type) {
          setReferredBy({
            id: String(ref.id),
            name: String(ref.name),
            firmName: String(ref.firmName),
            type: ref.type as "architect" | "builder" | "contractor" | "interior_designer",
            phone: ref.phone ? String(ref.phone) : undefined,
            email: ref.email ? String(ref.email) : undefined,
          });
        }
      }

      // Set action trigger & priority
      // Check if priority is not standard (1, 3, 5) - use manual mode
      const standardPriorities = [1, 3, 5];
      if (!standardPriorities.includes(lead.priority)) {
        setUseManualPriority(true);
        setManualPriority(lead.priority);
        setFollowUpPriority("normal"); // default
      } else {
        setUseManualPriority(false);
        setManualPriority(lead.priority);
        setFollowUpPriority(
          lead.priority === 1 ? "urgent" : lead.priority <= 3 ? "normal" : "low"
        );
      }
      
      setNextActionDate(lead.next_follow_up ? new Date(lead.next_follow_up) : addDays(new Date(), 2));
      setInitialNote(lead.notes || "");
    }
  }, [lead, staffMembers]);

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
    if (materialInterests.length === 0) {
      errors.materialInterests = "At least one material interest is required";
    }

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
      const assignedMember = staffMembers.find(m => m.id === assignedTo);
      const assignedToName = assignedMember?.name || assignedTo;

      // Calculate priority - use manual if enabled, otherwise use follow-up priority
      const finalPriority = useManualPriority 
        ? manualPriority 
        : (followUpPriority === "urgent" ? 1 : followUpPriority === "normal" ? 3 : 5);

      const updatedData: Partial<Lead> = {
        name: primaryContact.name,
        phone: primaryContact.phone,
        alternate_phone: primaryContact.alternatePhone || null,
        email: primaryContact.email || null,
        designation: primaryContact.designation,
        firm_name: primaryContact.firmName || null,
        site_location: siteLocation,
        site_photo_url: sitePhotoUrl,
        site_plus_code: sitePlusCode,
        construction_stage: constructionStage || null,
        estimated_quantity: estimatedQuantity,
        material_interests: materialInterests.includes("other") && otherMaterial
          ? [...materialInterests.filter(m => m !== "other"), otherMaterial]
          : materialInterests,
        source: leadSource || lead.source,
        referred_by: referredBy as any,
        assigned_to: assignedToName,
        priority: finalPriority,
        notes: initialNote || null,
        next_follow_up: format(nextActionDate, "yyyy-MM-dd"),
      };

      await onSave(lead.id, updatedData);

      toast({
        title: "Lead Updated",
        description: `${primaryContact.name}'s information has been updated.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update lead. Please try again.",
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
          <h2 className="text-lg font-semibold">Edit Lead Details</h2>
          <p className="text-sm text-muted-foreground">
            Update information for {lead.name}
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
              constructionStage={constructionStage || "plastering"}
              estimatedQuantity={estimatedQuantity}
              materialInterests={materialInterests}
              otherMaterial={otherMaterial}
              onSiteLocationChange={setSiteLocation}
              onSitePhotoChange={handleSitePhotoChange}
              onConstructionStageChange={(stage) => setConstructionStage(stage)}
              onEstimatedQuantityChange={setEstimatedQuantity}
              onMaterialInterestsChange={setMaterialInterests}
              onOtherMaterialChange={setOtherMaterial}
              validationErrors={validationErrors}
            />

            <Separator />

            {/* Group 3: Source & Relationship */}
            <SourceRelationshipSection
              leadSource={leadSource || "walk_in"}
              referredBy={referredBy}
              assignedTo={assignedTo}
              onSourceChange={(source) => setLeadSource(source)}
              onReferredByChange={setReferredBy}
              onAssignedToChange={setAssignedTo}
              validationErrors={validationErrors}
            />

            <Separator />

            {/* Group 4: Action Trigger */}
            <ActionTriggerSection
              followUpPriority={followUpPriority}
              nextActionDate={nextActionDate}
              nextActionTime={nextActionTime || "10:00"}
              initialNote={initialNote}
              leadSource={leadSource || "walk_in"}
              constructionStage={constructionStage || "plastering"}
              onFollowUpPriorityChange={(priority) => {
                setFollowUpPriority(priority);
                if (!useManualPriority) {
                  // Sync manual priority when not in manual mode
                  setManualPriority(priority === "urgent" ? 1 : priority === "normal" ? 3 : 5);
                }
              }}
              onNextActionDateChange={setNextActionDate}
              onNextActionTimeChange={setNextActionTime}
              onInitialNoteChange={setInitialNote}
              validationErrors={validationErrors}
            />

            <Separator />

            {/* Priority Override Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Priority Override
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="manual-priority">Manual Priority Control</Label>
                    <p className="text-xs text-muted-foreground">
                      Override the auto-calculated priority with a specific value
                    </p>
                  </div>
                  <Switch
                    id="manual-priority"
                    checked={useManualPriority}
                    onCheckedChange={setUseManualPriority}
                  />
                </div>

                {useManualPriority && (
                  <div className="space-y-2">
                    <Label>Select Priority Level</Label>
                    <Select
                      value={(manualPriority ?? 3).toString()}
                      onValueChange={(val) => setManualPriority(parseInt(val))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_LEVELS.map((priority) => (
                          <SelectItem key={priority.value} value={priority.value.toString()}>
                            <div className="flex items-center gap-2">
                              <span className={cn("w-2 h-2 rounded-full", priority.color)} />
                              {priority.label} (Level {priority.value})
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Current priority will be set to: <strong>{PRIORITY_LEVELS.find(p => p.value === manualPriority)?.label}</strong>
                    </p>
                  </div>
                )}

                {!useManualPriority && (
                  <p className="text-xs text-muted-foreground">
                    Priority is calculated from Follow-Up Priority above. Current: <strong>
                      {followUpPriority === "urgent" ? "Very High (1)" : followUpPriority === "normal" ? "Medium (3)" : "Very Low (5)"}
                    </strong>
                  </p>
                )}
              </CardContent>
            </Card>
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
