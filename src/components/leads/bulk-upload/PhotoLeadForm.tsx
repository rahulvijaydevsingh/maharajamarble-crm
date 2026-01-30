import React, { useState, useCallback, useEffect } from "react";
import { addDays, format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

import { ContactDetailsSection, ContactPerson } from "../smart-form/ContactDetailsSection";
import { SiteDetailsSection } from "../smart-form/SiteDetailsSection";
import { SourceRelationshipSection } from "../smart-form/SourceRelationshipSection";
import { ActionTriggerSection } from "../smart-form/ActionTriggerSection";

import {
  LeadSource,
  ConstructionStage,
  FollowUpPriority,
  ProfessionalRef,
  DuplicateCheckResult,
} from "@/types/lead";

interface PhotoLeadData {
  id: string;
  file: File;
  previewUrl: string;
  designation: string;
  name: string;
  phone: string;
  alternatePhone: string;
  email: string;
  firmName: string;
  siteLocation: string;
  sitePlusCode: string | null;
  constructionStage: ConstructionStage;
  estimatedQuantity: number | null;
  materialInterests: string[];
  otherMaterial: string;
  leadSource: LeadSource;
  assignedTo: string;
  referredBy: string;
  followUpPriority: FollowUpPriority;
  nextActionDate: Date;
  nextActionTime: string;
  initialNote: string;
  status: "pending" | "saved" | "skipped" | "duplicate";
  duplicateInfo?: string;
}

interface ApplyToRemainingState {
  enabled: boolean;
  leadSource: boolean;
  assignedTo: boolean;
  constructionStage: boolean;
  followUpPriority: boolean;
  materialInterests: boolean;
}

interface PhotoLeadFormProps {
  currentLead: PhotoLeadData;
  onUpdateLead: (field: keyof PhotoLeadData, value: any) => void;
  applyToRemaining: ApplyToRemainingState;
  onApplyToRemainingChange: (newState: ApplyToRemainingState) => void;
  onDuplicateFound?: (result: DuplicateCheckResult, key: string) => void;
}

export function PhotoLeadForm({
  currentLead,
  onUpdateLead,
  applyToRemaining,
  onApplyToRemainingChange,
  onDuplicateFound,
}: PhotoLeadFormProps) {
  const [duplicateResults, setDuplicateResults] = useState<{ [key: string]: DuplicateCheckResult }>({});
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Convert current lead to contacts array for ContactDetailsSection
  const [contacts, setContacts] = useState<ContactPerson[]>([
    {
      id: currentLead.id,
      designation: currentLead.designation || "owner",
      name: currentLead.name || "",
      email: currentLead.email || "",
      phone: currentLead.phone || "",
      alternatePhone: currentLead.alternatePhone || "",
      firmName: currentLead.firmName || "",
    },
  ]);

  // Sync contacts changes back to the parent
  useEffect(() => {
    if (contacts[0]) {
      const contact = contacts[0];
      if (contact.designation !== currentLead.designation) onUpdateLead("designation", contact.designation);
      if (contact.name !== currentLead.name) onUpdateLead("name", contact.name);
      if (contact.email !== currentLead.email) onUpdateLead("email", contact.email);
      if (contact.phone !== currentLead.phone) onUpdateLead("phone", contact.phone);
      if (contact.alternatePhone !== currentLead.alternatePhone) onUpdateLead("alternatePhone", contact.alternatePhone);
      if (contact.firmName !== currentLead.firmName) onUpdateLead("firmName", contact.firmName);
    }
  }, [contacts]);

  // Reset contacts when currentLead changes (navigating to a new photo)
  useEffect(() => {
    setContacts([
      {
        id: currentLead.id,
        designation: currentLead.designation || "owner",
        name: currentLead.name || "",
        email: currentLead.email || "",
        phone: currentLead.phone || "",
        alternatePhone: currentLead.alternatePhone || "",
        firmName: currentLead.firmName || "",
      },
    ]);
  }, [currentLead.id]);

  const handleDuplicateFound = useCallback((result: DuplicateCheckResult, contactKey: string) => {
    setDuplicateResults(prev => ({ ...prev, [contactKey]: result }));
    onDuplicateFound?.(result, contactKey);
  }, [onDuplicateFound]);

  const handleSitePhotoChange = (photoUrl: string | null, plusCode: string | null) => {
    // Site photo is already handled by bulk upload, but we can update plus code if needed
    if (plusCode !== currentLead.sitePlusCode) {
      onUpdateLead("sitePlusCode", plusCode);
    }
  };

  // Handle referredBy as ProfessionalRef
  const referredByRef: ProfessionalRef | null = currentLead.referredBy
    ? { id: "manual", name: currentLead.referredBy, firmName: "", type: "contractor" }
    : null;

  const handleReferredByChange = (ref: ProfessionalRef | null) => {
    onUpdateLead("referredBy", ref?.name || "");
  };

  return (
    <ScrollArea id="photo-lead-form" className="h-[520px] pr-4">
      <div className="space-y-4 pb-24">
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
          siteLocation={currentLead.siteLocation}
          sitePhotoUrl={currentLead.previewUrl}
          sitePlusCode={currentLead.sitePlusCode}
          constructionStage={currentLead.constructionStage}
          estimatedQuantity={currentLead.estimatedQuantity}
          materialInterests={currentLead.materialInterests}
          otherMaterial={currentLead.otherMaterial}
          onSiteLocationChange={(v) => onUpdateLead("siteLocation", v)}
          onSitePhotoChange={handleSitePhotoChange}
          onConstructionStageChange={(v) => onUpdateLead("constructionStage", v)}
          onEstimatedQuantityChange={(v) => onUpdateLead("estimatedQuantity", v)}
          onMaterialInterestsChange={(v) => onUpdateLead("materialInterests", v)}
          onOtherMaterialChange={(v) => onUpdateLead("otherMaterial", v)}
          validationErrors={validationErrors}
          hidePhotoUpload={true}
        />

        <Separator />

        {/* Group 3: Source & Relationship */}
        <SourceRelationshipSection
          leadSource={currentLead.leadSource}
          referredBy={referredByRef}
          assignedTo={currentLead.assignedTo}
          onSourceChange={(v) => onUpdateLead("leadSource", v)}
          onReferredByChange={handleReferredByChange}
          onAssignedToChange={(v) => onUpdateLead("assignedTo", v)}
          validationErrors={validationErrors}
        />

        <Separator />

        {/* Group 4: Action Trigger */}
        <ActionTriggerSection
          followUpPriority={currentLead.followUpPriority}
          nextActionDate={currentLead.nextActionDate}
          nextActionTime={currentLead.nextActionTime}
          initialNote={currentLead.initialNote}
          leadSource={currentLead.leadSource}
          constructionStage={currentLead.constructionStage}
          onFollowUpPriorityChange={(v) => onUpdateLead("followUpPriority", v)}
          onNextActionDateChange={(v) => onUpdateLead("nextActionDate", v)}
          onNextActionTimeChange={(v) => onUpdateLead("nextActionTime", v)}
          onInitialNoteChange={(v) => onUpdateLead("initialNote", v)}
          validationErrors={validationErrors}
        />

        <Separator />

        {/* Apply to Remaining */}
        <Card className="bg-muted/50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                id="applyRemaining"
                checked={applyToRemaining.enabled}
                onCheckedChange={(checked) =>
                  onApplyToRemainingChange({ ...applyToRemaining, enabled: checked === true })
                }
              />
              <Label htmlFor="applyRemaining" className="text-sm font-medium">
                🔄 Apply These Values to All Remaining Photos
              </Label>
            </div>
            {applyToRemaining.enabled && (
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  { key: "leadSource" as const, label: "Source" },
                  { key: "assignedTo" as const, label: "Assigned To" },
                  { key: "constructionStage" as const, label: "Stage" },
                  { key: "followUpPriority" as const, label: "Priority" },
                  { key: "materialInterests" as const, label: "Materials" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-1">
                    <Checkbox
                      id={`apply-${item.key}`}
                      checked={applyToRemaining[item.key]}
                      onCheckedChange={(checked) =>
                        onApplyToRemainingChange({
                          ...applyToRemaining,
                          [item.key]: checked === true,
                        })
                      }
                    />
                    <Label htmlFor={`apply-${item.key}`} className="text-xs">
                      {item.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
