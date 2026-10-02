import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ContactDetailsSection,
  ContactPerson,
} from "@/components/leads/smart-form/ContactDetailsSection";
import { SourceRelationshipSection } from "@/components/leads/smart-form/SourceRelationshipSection";
import { LeadSource, ProfessionalRef, DuplicateCheckResult } from "@/types/lead";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { Customer } from "@/hooks/useCustomers";
import { CustomerAddressSection, isValidCustomerPlusCode } from "./CustomerAddressSection";
import { CustomerDetailsSection } from "./CustomerDetailsSection";
import { CustomerPurchaseSection } from "./CustomerPurchaseSection";
import { serializeCustomerAdditionalContacts } from "@/lib/customerContacts";

interface EditSmartCustomerFormProps {
  customer: Customer;
  onSave: (customerId: string, updatedData: Partial<Customer>) => Promise<void>;
  onCancel: () => void;
}

function parseAdditionalContacts(value: unknown): ContactPerson[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item, index) => ({
      id: "contact_" + Date.now() + "_" + index,
      designation:
        typeof item.designation === "string" ? item.designation : "owner",
      name: typeof item.name === "string" ? item.name : "",
      email: typeof item.email === "string" ? item.email : "",
      phone: typeof item.phone === "string" ? item.phone : "",
      alternatePhone:
        typeof item.alternatePhone === "string" ? item.alternatePhone : "",
      firmName: typeof item.firmName === "string" ? item.firmName : "",
    }));
}

export function EditSmartCustomerForm({
  customer,
  onSave,
  onCancel,
}: EditSmartCustomerFormProps) {
  const { toast } = useToast();
  const { staffMembers } = useActiveStaff();
  const existingAssignedName = customer.assigned_to?.trim() || "";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [address, setAddress] = useState("");
  const [sitePlusCode, setSitePlusCode] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource>("walk_in");
  const [assignedTo, setAssignedTo] = useState("");
  const [referredBy, setReferredBy] = useState<ProfessionalRef | null>(null);
  const [profession, setProfession] = useState("");
  const [materialsPurchased, setMaterialsPurchased] = useState<string[]>([]);
  const [quantityPurchased, setQuantityPurchased] = useState<number | null>(null);
  const [quantityUnit, setQuantityUnit] = useState("sqft");
  const [billNumber, setBillNumber] = useState("");
  const [pendingFollowups, setPendingFollowups] = useState<string[]>([]);
  const [initialNote, setInitialNote] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formResetSignal, setFormResetSignal] = useState(0);

  useEffect(() => {
    const primary: ContactPerson = {
      id: "contact_" + Date.now(),
      designation: "owner",
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone,
      alternatePhone: customer.alternate_phone || "",
      firmName: customer.company_name || "",
    };

    setContacts([primary, ...parseAdditionalContacts(customer.additional_contacts)]);
    setAddress(customer.address || "");
    setSitePlusCode(customer.site_plus_code || "");
    setLeadSource((customer.source as LeadSource) || "walk_in");
    setCustomerAssignment(customer.assigned_to);
    setReferredBy(
      customer.referred_by
        ? {
            id: customer.referred_by_professional_id || "",
            name: customer.referred_by,
            firmName: "",
            type: "contractor",
          }
        : null,
    );
    setProfession(customer.profession || "");
    setMaterialsPurchased(customer.materials_purchased || []);
    setQuantityPurchased(customer.quantity_purchased ?? null);
    setQuantityUnit(customer.quantity_unit || "sqft");
    setBillNumber(customer.bill_number || "");
    setPendingFollowups(customer.pending_followups || []);
    setInitialNote(customer.notes || "");
    setValidationErrors({});
    setFormResetSignal((value) => value + 1);
  }, [customer, staffMembers]);

  const setCustomerAssignment = (assignedName: string | null | undefined) => {
    const normalizedName = assignedName?.trim().toLowerCase() || "";
    const match = staffMembers.find(
      (member) => member.name?.trim().toLowerCase() === normalizedName,
    );
    setAssignedTo(match?.id || "");
  };

  const handleDuplicateFound = useCallback(
    (_result: DuplicateCheckResult, _contactKey: string) => {
      // Editing an existing customer does not block on the current customer's own phone.
    },
    [],
  );

  const validateForm = () => {
    const errors: Record<string, string> = {};

    contacts.forEach((contact, index) => {
      if (!contact.name.trim()) {
        errors["contacts." + index + ".name"] = "Name is required";
      }
      if (!contact.phone || contact.phone.length !== 10) {
        errors["contacts." + index + ".phone"] =
          "Valid 10-digit phone number is required";
      }
      if (contact.alternatePhone && contact.alternatePhone.length !== 10) {
        errors["contacts." + index + ".alternatePhone"] =
          "Invalid phone number (must be 10 digits)";
      }
      if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) {
        errors["contacts." + index + ".email"] = "Invalid email format";
      }
    });

    if (!address.trim()) {
      errors.address = "Address is required";
    }

    if (sitePlusCode.trim() && !isValidCustomerPlusCode(sitePlusCode)) {
      errors.sitePlusCode =
        "Enter a valid full or short Plus Code, or leave it blank.";
    }

    if (!assignedTo) {
      // A customer whose assignee is no longer an active team member keeps that assignee unless changed.
      if (!existingAssignedName) {
        errors.assignedTo = "Select an active team member.";
      }
    } else if (!staffMembers.find((member) => member.id === assignedTo)?.name?.trim()) {
      errors.assignedTo = "The selected team member has no resolvable full name.";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the highlighted errors before saving.",
        variant: "destructive",
      });
      return;
    }

    const selectedStaffName =
      staffMembers.find((member) => member.id === assignedTo)?.name?.trim() || "";
    const assignedName =
      selectedStaffName || (!assignedTo ? existingAssignedName : "");

    if (!assignedName) {
      setValidationErrors((current) => ({
        ...current,
        assignedTo: "Select a team member with a resolvable full name.",
      }));
      toast({
        title: "Validation Error",
        description: "A valid assigned team member is required.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const primaryContact = contacts[0];
      const updatedData: Partial<Customer> = {
        name: primaryContact.name.trim(),
        phone: primaryContact.phone,
        alternate_phone: primaryContact.alternatePhone || null,
        email: primaryContact.email || null,
        company_name: primaryContact.firmName || null,
        address: address.trim(),
        source: leadSource,
        assigned_to: assignedName,
        notes: initialNote || null,
        site_plus_code: sitePlusCode.trim() || null,
        additional_contacts: serializeCustomerAdditionalContacts(contacts),
        referred_by: referredBy?.name?.trim() || null,
        referred_by_professional_id: referredBy?.id || null,
        profession: profession.trim() || null,
        materials_purchased: materialsPurchased,
        quantity_purchased: quantityPurchased,
        quantity_unit: quantityUnit,
        bill_number: billNumber.trim() || null,
        pending_followups: pendingFollowups,
      };

      await onSave(customer.id, updatedData);
      toast({
        title: "Customer Updated",
        description:
          primaryContact.name.trim() + "'s information has been updated.",
      });
    } catch (error) {
      console.error("Failed to update customer:", error);
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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b pb-4">
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

      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            <ContactDetailsSection
              contacts={contacts}
              onContactsChange={setContacts}
              onDuplicateFound={handleDuplicateFound}
              validationErrors={validationErrors}
              duplicateResults={{}}
            />
            <Separator />
            <CustomerAddressSection
              address={address}
              sitePlusCode={sitePlusCode}
              onAddressChange={setAddress}
              onSitePlusCodeChange={setSitePlusCode}
              validationErrors={validationErrors}
              resetSignal={formResetSignal}
            />
            <Separator />
            <SourceRelationshipSection
              leadSource={leadSource}
              referredBy={referredBy}
              assignedTo={assignedTo}
              onSourceChange={setLeadSource}
              onReferredByChange={setReferredBy}
              onAssignedToChange={setAssignedTo}
              validationErrors={validationErrors}
            />
            {staffMembers.length > 0 && !assignedTo && existingAssignedName && (
              <p className="text-xs text-muted-foreground">
                Currently assigned to {existingAssignedName}, who is not an active
                team member. Saving keeps this assignee unless you choose someone else.
              </p>
            )}
            <Separator />
            <CustomerDetailsSection
              profession={profession}
              onProfessionChange={setProfession}
            />
            <Separator />
            <CustomerPurchaseSection
              materialsPurchased={materialsPurchased}
              quantityPurchased={quantityPurchased}
              quantityUnit={quantityUnit}
              billNumber={billNumber}
              pendingFollowups={pendingFollowups}
              onMaterialsPurchasedChange={setMaterialsPurchased}
              onQuantityPurchasedChange={setQuantityPurchased}
              onQuantityUnitChange={setQuantityUnit}
              onBillNumberChange={setBillNumber}
              onPendingFollowupsChange={setPendingFollowups}
            />
            <Separator />
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="customer-edit-initial-note">Initial note</Label>
              <textarea
                id="customer-edit-initial-note"
                value={initialNote}
                onChange={(event) => setInitialNote(event.target.value)}
                placeholder="Add an initial note"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </ScrollArea>

        <div className="mt-auto flex items-center justify-between border-t pt-4">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <CheckCircle className="h-4 w-4" />
            <span>Changes will be saved immediately</span>
          </div>
          <div className="ml-auto flex gap-2">
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
