import React, { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Phone, Plus, Trash2, Loader2, CheckCircle, AlertTriangle, Building2 } from "lucide-react";
import { DuplicateCheckResult } from "@/types/lead";
import { DuplicateLeadModal } from "@/components/leads/DuplicateLeadModal";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { useEntityPhoneDuplicateCheck } from "@/hooks/useEntityPhoneDuplicateCheck";

export interface ContactPerson {
  id: string;
  designation: string;
  name: string;
  email: string;
  phone: string;
  alternatePhone: string;
  firmName: string;
}

interface ContactDetailsSectionProps {
  contacts: ContactPerson[];
  onContactsChange: (contacts: ContactPerson[]) => void;
  onDuplicateFound: (result: DuplicateCheckResult, contactId: string) => void;
  validationErrors?: { [key: string]: string };
  duplicateResults?: { [contactId: string]: DuplicateCheckResult };
}

export function ContactDetailsSection({
  contacts,
  onContactsChange,
  onDuplicateFound,
  validationErrors = {},
  duplicateResults: externalDuplicateResults = {},
}: ContactDetailsSectionProps) {
  const { getFieldOptions } = useControlPanelSettings();
  const { checking: checkingPhones, results: duplicateResults, checkDuplicate } = useEntityPhoneDuplicateCheck();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDuplicateKey, setSelectedDuplicateKey] = useState<string | null>(null);

  const professionalTypes = getFieldOptions("professionals", "professional_type");
  const professionalTypeValues = new Set(professionalTypes.map(o => o.value));

  const leadDesignations = getFieldOptions("leads", "designation");
  // Lead control panel should control only "Individual" section.
  // We consider anything that is a professional_type as "Professional" and exclude it here.
  const individualDesignations = leadDesignations.filter(o => !professionalTypeValues.has(o.value));

  const isProfessionalDesignation = (designation: string) => professionalTypeValues.has(designation);

  // Sync internal duplicate results to parent
  useEffect(() => {
    (Object.entries(duplicateResults) as Array<[string, DuplicateCheckResult]>).forEach(([key, result]) => {
      onDuplicateFound(result, key);
    });
  }, [duplicateResults, onDuplicateFound]);

  const formatPhone = (value: string): string => {
    return value.replace(/\D/g, '').slice(0, 10);
  };

  const validatePhoneLength = (phone: string): boolean => {
    return phone.length === 0 || phone.length === 10;
  };

  const updateContact = (index: number, field: keyof ContactPerson, value: string) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    
    // Clear firm name if switching from professional to individual
    if (field === "designation" && !isProfessionalDesignation(value)) {
      updated[index].firmName = "";
    }
    
    onContactsChange(updated);
  };

  const handlePhoneChange = (index: number, field: 'phone' | 'alternatePhone', value: string) => {
    const formattedPhone = formatPhone(value);
    updateContact(index, field, formattedPhone);
  };

  const handlePhoneBlur = (index: number, field: 'phone' | 'alternatePhone', phone: string) => {
    if (phone.length === 10) {
      const checkKey = `${contacts[index].id}_${field}`;
      // Always check against leads and customers; if this contact is professional, also check professionals.
      const entities = isProfessionalDesignation(contacts[index].designation)
        ? (["leads", "customers", "professionals"] as const)
        : (["leads", "customers"] as const);

      checkDuplicate({ phone, fieldKey: checkKey, entities });
    }
  };

  const handleViewDuplicate = (checkKey: string) => {
    setSelectedDuplicateKey(checkKey);
    setModalOpen(true);
  };

  const handleCloseDuplicateModal = () => {
    setModalOpen(false);
    setSelectedDuplicateKey(null);
  };

  const addContact = () => {
    const newContact: ContactPerson = {
      id: `contact_${Date.now()}`,
      designation: "owner",
      name: "",
      email: "",
      phone: "",
      alternatePhone: "",
      firmName: "",
    };
    onContactsChange([...contacts, newContact]);
  };

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      onContactsChange(contacts.filter((_, i) => i !== index));
    }
  };

  const getTypeLabel = (type: string | null) => {
    switch (type) {
      case "lead": return "Active Lead";
      case "customer": return "Customer";
      case "professional": return "Professional";
      case "lost_lead": return "Lost Lead (Archive)";
      case "deleted_lead": return "Deleted Lead (Recycle Bin)";
      default: return "Record";
    }
  };

  const getDuplicateAlertStyle = (type: string | null) => {
    switch (type) {
      case "lost_lead":
        return { border: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/20", titleColor: "text-yellow-800 dark:text-yellow-200", descColor: "text-yellow-700 dark:text-yellow-300", iconColor: "text-yellow-600" };
      case "deleted_lead":
        return { border: "border-gray-400", bg: "bg-gray-50 dark:bg-gray-900/20", titleColor: "text-gray-700 dark:text-gray-300", descColor: "text-gray-600 dark:text-gray-400", iconColor: "text-gray-500" };
      default:
        return { border: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/20", titleColor: "text-amber-800 dark:text-amber-200", descColor: "text-amber-700 dark:text-amber-300", iconColor: "text-amber-600" };
    }
  };

  const renderPhoneField = (
    contact: ContactPerson,
    index: number,
    field: 'phone' | 'alternatePhone',
    label: string,
    required: boolean
  ) => {
    const checkKey = `${contact.id}_${field}`;
    const isChecking = checkingPhones[checkKey];
    const duplicateResult = duplicateResults[checkKey];
    const phoneValue = contact[field];
    const errorKey = `contacts.${index}.${field}`;
    const isValidLength = validatePhoneLength(phoneValue);
    const showLengthError = phoneValue.length > 0 && phoneValue.length < 10;

    return (
      <div className="space-y-2">
        <Label htmlFor={`${field}_${index}`} className="flex items-center gap-2">
          <Phone className="h-4 w-4" />
          {label} {required && "*"}
          {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </Label>
        <div className="relative">
          <Input
            id={`${field}_${index}`}
            type="tel"
            value={phoneValue}
            onChange={(e) => handlePhoneChange(index, field, e.target.value)}
            onBlur={() => handlePhoneBlur(index, field, phoneValue)}
            placeholder="10-digit phone number"
            className={`pr-10 ${validationErrors[errorKey] || showLengthError ? 'border-destructive' : ''} ${duplicateResult?.found === false && phoneValue.length === 10 ? 'border-green-500' : ''}`}
            maxLength={10}
          />
          {duplicateResult?.found === false && phoneValue.length === 10 && (
            <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
          )}
        </div>
        
        {/* Length validation error */}
        {showLengthError && (
          <p className="text-sm text-destructive">Phone number must be exactly 10 digits ({phoneValue.length}/10)</p>
        )}
        
        {validationErrors[errorKey] && !showLengthError && (
          <p className="text-sm text-destructive">{validationErrors[errorKey]}</p>
        )}
        
        {/* Duplicate Warning */}
        {duplicateResult?.found && duplicateResult.existingRecord && (() => {
          const style = getDuplicateAlertStyle(duplicateResult.type);
          const isLost = duplicateResult.type === "lost_lead";
          const isDeleted = duplicateResult.type === "deleted_lead";
          const isNonBlocking = isLost || isDeleted;
          return (
            <Alert variant="destructive" className={`${style.border} ${style.bg} py-2`}>
              <AlertTriangle className={`h-4 w-4 ${style.iconColor}`} />
              <AlertTitle className={`${style.titleColor} text-sm`}>
                {isNonBlocking ? "" : "Duplicate "}{getTypeLabel(duplicateResult.type)} Found!
              </AlertTitle>
              <AlertDescription className={`${style.descColor} text-xs`}>
                <span>
                  <strong>{duplicateResult.existingRecord.name}</strong>
                  {isLost && duplicateResult.existingRecord.lost_reason && (
                    <> — Lost for: {duplicateResult.existingRecord.lost_reason}</>
                  )}
                  {isLost && duplicateResult.existingRecord.lost_at && (
                    <> ({formatDistanceToNow(new Date(duplicateResult.existingRecord.lost_at))} ago)</>
                  )}
                  {!isLost && !isDeleted && <> - Assigned to {duplicateResult.existingRecord.assigned_to}</>}
                </span>
                {isNonBlocking && (
                  <p className="mt-1 text-xs opacity-80">You can still create this lead.</p>
                )}
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm" 
                  className={`mt-2 h-6 text-xs ${style.border} ${style.titleColor}`}
                  onClick={() => handleViewDuplicate(checkKey)}
                >
                  {isLost ? "View Previous History" : isDeleted ? "View in Recycle Bin" : "View Details"}
                </Button>
              </AlertDescription>
            </Alert>
          );
        })()}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Group 1: Contact Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {contacts.map((contact, index) => {
          const showFirmName = isProfessionalDesignation(contact.designation);
          
          return (
            <div key={contact.id} className="space-y-4 p-4 border rounded-lg relative">
              {contacts.length > 1 && (
                <div className="absolute top-2 right-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeContact(index)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {index > 0 && (
                <p className="text-sm text-muted-foreground font-medium">Additional Contact {index}</p>
              )}

              {/* Designation */}
              <div className="space-y-2">
                <Label htmlFor={`designation_${index}`}>Designation *</Label>
                <Select
                  value={contact.designation}
                  onValueChange={(value) => updateContact(index, "designation", value)}
                >
                  <SelectTrigger className={validationErrors[`contacts.${index}.designation`] ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Individual</div>
                    {individualDesignations.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Professional</div>
                    {professionalTypes.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationErrors[`contacts.${index}.designation`] && (
                  <p className="text-sm text-destructive">{validationErrors[`contacts.${index}.designation`]}</p>
                )}
              </div>

              {/* Firm Name - Only for Professional designations */}
              {showFirmName && (
                <div className="space-y-2">
                  <Label htmlFor={`firmName_${index}`} className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Firm Name <span className="text-muted-foreground text-xs">(Optional)</span>
                  </Label>
                  <Input
                    id={`firmName_${index}`}
                    value={contact.firmName}
                    onChange={(e) => updateContact(index, "firmName", e.target.value)}
                    placeholder="Enter firm/company name"
                  />
                </div>
              )}

              {/* Name & Email Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`name_${index}`}>Full Name *</Label>
                  <Input
                    id={`name_${index}`}
                    value={contact.name}
                    onChange={(e) => updateContact(index, "name", e.target.value)}
                    placeholder="Enter full name"
                    className={validationErrors[`contacts.${index}.name`] ? 'border-destructive' : ''}
                  />
                  {validationErrors[`contacts.${index}.name`] && (
                    <p className="text-sm text-destructive">{validationErrors[`contacts.${index}.name`]}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`email_${index}`}>Email Address</Label>
                  <Input
                    id={`email_${index}`}
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateContact(index, "email", e.target.value)}
                    placeholder="email@example.com"
                    className={validationErrors[`contacts.${index}.email`] ? 'border-destructive' : ''}
                  />
                  {validationErrors[`contacts.${index}.email`] && (
                    <p className="text-sm text-destructive">{validationErrors[`contacts.${index}.email`]}</p>
                  )}
                </div>
              </div>

              {/* Phone Numbers Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderPhoneField(contact, index, 'phone', 'Contact Number', true)}
                {renderPhoneField(contact, index, 'alternatePhone', 'Alternate Contact', false)}
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addContact}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Another Contact Person
        </Button>
      </CardContent>

      {/* Duplicate Lead Modal */}
      {selectedDuplicateKey && duplicateResults[selectedDuplicateKey] && (
        <DuplicateLeadModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          duplicateResult={duplicateResults[selectedDuplicateKey]}
          onViewExisting={() => {
            const leadId = duplicateResults[selectedDuplicateKey]?.existingRecord?.id;
            if (leadId) {
              window.open(`/leads?view=${leadId}`, "_blank");
            }
            handleCloseDuplicateModal();
          }}
          onAddToExisting={() => {
            const leadId = duplicateResults[selectedDuplicateKey]?.existingRecord?.id;
            if (leadId) {
              window.open(`/leads?edit=${leadId}`, "_blank");
            }
            handleCloseDuplicateModal();
          }}
          onCancel={handleCloseDuplicateModal}
        />
      )}
    </Card>
  );
}
