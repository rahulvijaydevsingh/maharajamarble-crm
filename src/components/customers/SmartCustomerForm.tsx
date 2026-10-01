import React, { useCallback, useEffect, useState } from "react";
import { addDays, format, startOfToday } from "date-fns";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ContactDetailsSection,
  ContactPerson,
} from "@/components/leads/smart-form/ContactDetailsSection";
import { SourceRelationshipSection } from "@/components/leads/smart-form/SourceRelationshipSection";
import { DuplicateCheckResult, LeadSource, ProfessionalRef } from "@/types/lead";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerInsert, useCustomers } from "@/hooks/useCustomers";
import { useStaffActivityLog } from "@/hooks/useStaffActivityLog";
import { useTasks } from "@/hooks/useTasks";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { CustomerAddressSection, isValidCustomerPlusCode } from "./CustomerAddressSection";
import { CustomerDetailsSection } from "./CustomerDetailsSection";
import { CustomerPurchaseSection } from "./CustomerPurchaseSection";
import { CustomerFollowUpSection } from "./CustomerFollowUpSection";
import { serializeCustomerAdditionalContacts } from "@/lib/customerContacts";

interface SmartCustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getTodayString = () => format(startOfToday(), "yyyy-MM-dd");
const getDateFromToday = (days: number) =>
  format(addDays(startOfToday(), days), "yyyy-MM-dd");

export function SmartCustomerForm({ open, onOpenChange }: SmartCustomerFormProps) {
  const { toast } = useToast();
  const { addCustomer } = useCustomers();
  const { user } = useAuth();
  const { staffMembers } = useActiveStaff();
  const { logStaffAction } = useStaffActivityLog();
  const { addTask } = useTasks();
  const { getOptionLabel } = useControlPanelSettings();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<
    Record<string, DuplicateCheckResult>
  >({});
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [contacts, setContacts] = useState<ContactPerson[]>([
    {
      id: "contact_" + Date.now(),
      designation: "owner",
      name: "",
      email: "",
      phone: "",
      alternatePhone: "",
      firmName: "",
    },
  ]);
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
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [reviewDueDate, setReviewDueDate] = useState(getDateFromToday(7));
  const [reviewDueTime, setReviewDueTime] = useState("10:00");
  const [reviewReminderEnabled, setReviewReminderEnabled] = useState(false);
  const [reviewReminderTime, setReviewReminderTime] = useState("60");
  const [materialEnabled, setMaterialEnabled] = useState(false);
  const [materialDueDate, setMaterialDueDate] = useState(getDateFromToday(30));
  const [materialDueTime, setMaterialDueTime] = useState("10:00");
  const [materialReminderEnabled, setMaterialReminderEnabled] = useState(false);
  const [materialReminderTime, setMaterialReminderTime] = useState("60");
  const [today, setToday] = useState(getTodayString);
  const [formResetSignal, setFormResetSignal] = useState(0);

  const resetForm = useCallback(() => {
    setContacts([
      {
        id: "contact_" + Date.now(),
        designation: "owner",
        name: "",
        email: "",
        phone: "",
        alternatePhone: "",
        firmName: "",
      },
    ]);
    setAddress("");
    setSitePlusCode("");
    setLeadSource("walk_in");
    setAssignedTo("");
    setReferredBy(null);
    setProfession("");
    setMaterialsPurchased([]);
    setQuantityPurchased(null);
    setQuantityUnit("sqft");
    setBillNumber("");
    setPendingFollowups([]);
    setInitialNote("");
    setToday(getTodayString());
    setReviewEnabled(true);
    setReviewDueDate(getDateFromToday(7));
    setReviewDueTime("10:00");
    setReviewReminderEnabled(false);
    setReviewReminderTime("60");
    setMaterialEnabled(false);
    setMaterialDueDate(getDateFromToday(30));
    setMaterialDueTime("10:00");
    setMaterialReminderEnabled(false);
    setMaterialReminderTime("60");
    setValidationErrors({});
    setDuplicateResults({});
    setFormResetSignal((value) => value + 1);
  }, []);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || assignedTo) {
      return;
    }

    if (user?.id && staffMembers.some((member) => member.id === user.id)) {
      setAssignedTo(user.id);
      return;
    }

    if (staffMembers[0]) {
      setAssignedTo(staffMembers[0].id);
    }
  }, [assignedTo, open, staffMembers, user?.id]);

  const handleDuplicateFound = useCallback(
    (result: DuplicateCheckResult, contactKey: string) => {
      setDuplicateResults((current) => ({
        ...current,
        [contactKey]: result,
      }));
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
      errors.assignedTo = "Select a team member.";
    } else if (!staffMembers.find((member) => member.id === assignedTo)?.name?.trim()) {
      errors.assignedTo = "The selected team member has no resolvable full name.";
    }

    if (reviewEnabled && (!reviewDueDate || reviewDueDate < today)) {
      errors.reviewDueDate = "Choose today or a future date.";
    }

    if (materialEnabled && (!materialDueDate || materialDueDate < today)) {
      errors.materialDueDate = "Choose today or a future date.";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createTaskSafely = async (task: Parameters<typeof addTask>[0]) => {
    try {
      await addTask(task);
    } catch (error) {
      console.error("Failed to create customer task:", error);
      toast({
        title: "Task creation failed",
        description: "Failed to create task: " + task.title,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (Object.values(duplicateResults).some((result) => result.found)) {
      toast({
        title: "Duplicate Record",
        description:
          "Please resolve the duplicate before creating a new customer.",
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

    const assignedName =
      staffMembers.find((member) => member.id === assignedTo)?.name?.trim() || "";

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
      const customerData: CustomerInsert = {
        name: primaryContact.name.trim(),
        phone: primaryContact.phone,
        alternate_phone: primaryContact.alternatePhone || null,
        email: primaryContact.email || null,
        company_name: primaryContact.firmName || null,
        address: address.trim(),
        customer_type: "individual",
        status: "active",
        priority: 3,
        source: leadSource,
        notes: initialNote || null,
        assigned_to: assignedName,
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

      const newCustomer = await addCustomer(customerData);

      if (!newCustomer?.id) {
        throw new Error("Customer was not created");
      }

      const baseTask = {
        assigned_to: assignedName,
        status: "Pending",
        priority: "Medium",
        related_entity_type: "customer",
        related_entity_id: newCustomer.id,
      };

      if (reviewEnabled) {
        await createTaskSafely({
          ...baseTask,
          title: "Collect feedback from " + primaryContact.name.trim(),
          type: "Feedback Collection",
          due_date: reviewDueDate,
          due_time: reviewDueTime,
          reminder: reviewReminderEnabled,
          reminder_time: reviewReminderEnabled ? reviewReminderTime : null,
        });
      }

      if (materialEnabled && pendingFollowups.length > 0) {
        const labels = pendingFollowups
          .map((value) =>
            getOptionLabel("customers", "pending_followup", value),
          )
          .filter((label): label is string => Boolean(label));

        await createTaskSafely({
          ...baseTask,
          title:
            "Follow up: " +
            labels.join(", ") +
            " for " +
            primaryContact.name.trim(),
          type: "Follow-up Call",
          due_date: materialDueDate,
          due_time: materialDueTime,
          reminder: materialReminderEnabled,
          reminder_time: materialReminderEnabled ? materialReminderTime : null,
        });
      }

      logStaffAction(
        "create_customer",
        "Created customer: " + primaryContact.name.trim(),
        "customer",
      );

      toast({
        title: "Customer Created Successfully",
        description:
          "Customer " + primaryContact.name.trim() + " has been created.",
      });

      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Failed to create customer:", error);
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-h-[90vh] w-[calc(100vw-1rem)] flex max-w-[800px] flex-col p-0">
        <form
          onSubmit={handleSubmit}
          className="flex h-full flex-col overflow-hidden"
        >
          <DialogHeader className="shrink-0 px-3 pb-2 pt-4 sm:px-6 sm:pt-6">
            <DialogTitle className="text-xl">Add New Customer</DialogTitle>
            <DialogDescription>
              Create a customer record and capture purchase and follow-up details.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-3 sm:px-6">
            <div className="space-y-4 py-4 pb-6">
              <ContactDetailsSection
                contacts={contacts}
                onContactsChange={setContacts}
                onDuplicateFound={handleDuplicateFound}
                validationErrors={validationErrors}
                duplicateResults={duplicateResults}
              />
              <Separator />
              <CustomerAddressSection
                address={address}
                sitePlusCode={sitePlusCode}
                open={open}
                resetSignal={formResetSignal}
                onAddressChange={setAddress}
                onSitePlusCodeChange={setSitePlusCode}
                validationErrors={validationErrors}
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
              <CustomerFollowUpSection
                initialNote={initialNote}
                onInitialNoteChange={setInitialNote}
                reviewEnabled={reviewEnabled}
                reviewDueDate={reviewDueDate}
                reviewDueTime={reviewDueTime}
                reviewReminderEnabled={reviewReminderEnabled}
                reviewReminderTime={reviewReminderTime}
                onReviewEnabledChange={setReviewEnabled}
                onReviewDueDateChange={setReviewDueDate}
                onReviewDueTimeChange={setReviewDueTime}
                onReviewReminderEnabledChange={setReviewReminderEnabled}
                onReviewReminderTimeChange={setReviewReminderTime}
                materialEnabled={materialEnabled}
                materialDueDate={materialDueDate}
                materialDueTime={materialDueTime}
                materialReminderEnabled={materialReminderEnabled}
                materialReminderTime={materialReminderTime}
                onMaterialEnabledChange={setMaterialEnabled}
                onMaterialDueDateChange={setMaterialDueDate}
                onMaterialDueTimeChange={setMaterialDueTime}
                onMaterialReminderEnabledChange={setMaterialReminderEnabled}
                onMaterialReminderTimeChange={setMaterialReminderTime}
                showMaterialFollowUp={pendingFollowups.length > 0}
                minDate={today}
                validationErrors={validationErrors}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t px-3 py-3 sm:px-6 sm:py-4">
            <div className="mr-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
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
              disabled={
                isSubmitting ||
                Object.values(duplicateResults).some((result) => result.found)
              }
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : Object.values(duplicateResults).some((result) => result.found) ? (
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
