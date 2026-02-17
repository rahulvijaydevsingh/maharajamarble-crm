import React, { useState, useEffect, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProfessionals, Professional, ProfessionalInsert } from "@/hooks/useProfessionals";
import { useProfessionalForm } from "@/hooks/useProfessionalForm";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { Plus, Minus, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddProfessionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProfessional?: Professional | null;
}

export function AddProfessionalDialog({ open, onOpenChange, editingProfessional }: AddProfessionalDialogProps) {
  const { addProfessional, updateProfessional } = useProfessionals();
  const { getFieldOptions, loading: optionsLoading } = useControlPanelSettings();
  const { staffMembers } = useActiveStaff();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    phoneFields,
    additionalPhoneFields,
    addressFields,
    emailWebsite,
    emailWebsiteErrors,
    handlePhoneChange,
    addAdditionalPhoneField,
    removeAdditionalPhoneField,
    addAddressField,
    removeAddressField,
    handleAddressChange,
    handleEmailWebsiteChange,
    validateForm,
    resetForm,
    setInitialValues,
    getFormValues,
    hasDuplicates,
    canAddMorePhones,
    canAddMoreAddresses,
  } = useProfessionalForm();

  // Get dynamic options from control panel
  const professionalTypes = useMemo(() => 
    getFieldOptions("professionals", "professional_type"), 
    [getFieldOptions]
  );
  const serviceCategories = useMemo(() => 
    getFieldOptions("professionals", "service_category"), 
    [getFieldOptions]
  );
  const cities = useMemo(() => 
    getFieldOptions("professionals", "city"), 
    [getFieldOptions]
  );
  const statusOptions = useMemo(() => 
    getFieldOptions("professionals", "professional_status"), 
    [getFieldOptions]
  );
  const priorityOptions = useMemo(() => 
    getFieldOptions("professionals", "priority"), 
    [getFieldOptions]
  );

  // Helper to find default value from control panel options
  const getDefaultValue = (moduleName: string, fieldName: string, fallback: string): string => {
    const options = getFieldOptions(moduleName, fieldName);
    const defaultOpt = options.find(o => o.isDefault);
    return defaultOpt?.value || fallback;
  };

  const [formData, setFormData] = useState({
    name: "",
    firm_name: "",
    city: "",
    professional_type: getDefaultValue("professionals", "professional_type", "contractor"),
    service_category: "",
    status: getDefaultValue("professionals", "professional_status", "active"),
    priority: parseInt(getDefaultValue("professionals", "priority", "3")) || 3,
    rating: "",
    notes: "",
    assigned_to: staffMembers[0]?.name || "",
  });

  useEffect(() => {
    if (open) {
      if (editingProfessional) {
        setFormData({
          name: editingProfessional.name,
          firm_name: editingProfessional.firm_name || "",
          city: editingProfessional.city || "",
          professional_type: editingProfessional.professional_type,
          service_category: editingProfessional.service_category || "",
          status: editingProfessional.status,
          priority: editingProfessional.priority,
          rating: editingProfessional.rating?.toString() || "",
          notes: editingProfessional.notes || "",
          assigned_to: editingProfessional.assigned_to,
        });
        setInitialValues({
          phone: editingProfessional.phone,
          alternate_phone: editingProfessional.alternate_phone || "",
          additional_phones: (editingProfessional as any).additional_phones || [],
          email: editingProfessional.email || "",
          address: editingProfessional.address || "",
          additional_address: (editingProfessional as any).additional_address || "",
        });
      } else {
        handleReset();
      }
    }
  }, [editingProfessional, open, setInitialValues]);

  const handleReset = () => {
    setFormData({
      name: "",
      firm_name: "",
      city: "",
      professional_type: getDefaultValue("professionals", "professional_type", "contractor"),
      service_category: "",
      status: getDefaultValue("professionals", "professional_status", "active"),
      priority: parseInt(getDefaultValue("professionals", "priority", "3")) || 3,
      rating: "",
      notes: "",
      assigned_to: staffMembers[0]?.name || "",
    });
    resetForm();
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    if (!validateForm()) return;
    if (hasDuplicates) return;
    if (emailWebsiteErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      const formValues = getFormValues();
      
      const data: ProfessionalInsert = {
        name: formData.name.trim(),
        phone: formValues.phone,
        alternate_phone: formValues.alternate_phone || null,
        email: formValues.email || null,
        firm_name: formData.firm_name.trim() || null,
        address: formValues.address || null,
        city: formData.city || null,
        professional_type: formData.professional_type,
        service_category: formData.service_category || null,
        status: formData.status,
        priority: formData.priority,
        rating: formData.rating ? parseInt(formData.rating) : null,
        notes: formData.notes.trim() || null,
        assigned_to: formData.assigned_to,
        created_by: "Current User",
      };

      if (editingProfessional) {
        await updateProfessional(editingProfessional.id, data);
      } else {
        await addProfessional(data);
      }

      onOpenChange(false);
      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPhoneField = (
    field: typeof phoneFields[0],
    label: string,
    placeholder: string,
    showAddButton: boolean = false
  ) => (
    <div key={field.id} className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            value={field.value}
            onChange={(e) => handlePhoneChange(field.id, e.target.value, editingProfessional?.id)}
            placeholder={placeholder}
            maxLength={10}
            className={
              !field.isValid || field.duplicateFound
                ? "border-destructive"
                : field.value && field.isValid && !field.duplicateFound
                ? "border-green-500"
                : ""
            }
          />
        </div>
        {field.isDuplicateChecking && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {showAddButton && canAddMorePhones && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addAdditionalPhoneField}
            title="Add more phone numbers"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {!field.isValid && field.error && (
        <p className="text-sm text-destructive">{field.error}</p>
      )}
      {field.duplicateFound && field.duplicateRecord && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Duplicate found: {field.duplicateRecord.name} 
            {field.duplicateRecord.firm_name && ` (${field.duplicateRecord.firm_name})`} - 
            {field.duplicateRecord.professional_type}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderAdditionalPhoneField = (field: typeof additionalPhoneFields[0], index: number) => (
    <div key={field.id} className="space-y-1">
      <Label>Phone {index + 3}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={field.value}
          onChange={(e) => handlePhoneChange(field.id, e.target.value)}
          placeholder="Additional phone (landline/international)"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => removeAdditionalPhoneField(field.id)}
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">No validation required for additional numbers</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingProfessional ? "Edit Professional" : "Add New Professional"}</DialogTitle>
          <DialogDescription>
            {editingProfessional ? "Update professional information." : "Add a new professional to your directory."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name & Firm */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firm_name">Firm Name</Label>
              <Input
                id="firm_name"
                value={formData.firm_name}
                onChange={(e) => setFormData({ ...formData, firm_name: e.target.value })}
                placeholder="Company/Firm name"
              />
            </div>
          </div>

          {/* Phone Fields */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone *</Label>
                {renderPhoneField(phoneFields[0], "Phone *", "10-digit mobile number")}
              </div>
              <div className="space-y-2">
                <Label>Alternate Phone</Label>
                {renderPhoneField(phoneFields[1], "Alternate Phone", "10-digit mobile number", true)}
              </div>
            </div>

            {/* Additional Phone Fields */}
            {additionalPhoneFields.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {additionalPhoneFields.map((field, index) => (
                  <div key={field.id}>
                    {renderAdditionalPhoneField(field, index)}
                  </div>
                ))}
              </div>
            )}

            {additionalPhoneFields.length === 1 && canAddMorePhones && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addAdditionalPhoneField}
                className="text-primary"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Phone 4
              </Button>
            )}
          </div>

          {/* Email/Website */}
          <div className="space-y-2">
            <Label htmlFor="email">Email/Website</Label>
            <Input
              id="email"
              value={emailWebsite}
              onChange={(e) => handleEmailWebsiteChange(e.target.value)}
              placeholder="email@example.com, www.website.com (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">
              Enter multiple emails or websites separated by commas
            </p>
            {emailWebsiteErrors.length > 0 && (
              <div className="space-y-1">
                {emailWebsiteErrors.map((error, idx) => (
                  <p key={idx} className="text-sm text-destructive">{error}</p>
                ))}
              </div>
            )}
          </div>

          {/* Professional Type & Service Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="professional_type">Professional Type *</Label>
              <Select
                value={formData.professional_type}
                onValueChange={(v) => setFormData({ ...formData, professional_type: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {professionalTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_category">Service Category</Label>
              <Select
                value={formData.service_category}
                onValueChange={(v) => setFormData({ ...formData, service_category: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {serviceCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* City & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Select
                value={formData.city}
                onValueChange={(v) => setFormData({ ...formData, city: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.value} value={city.value}>{city.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority, Rating, Assigned To */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority.toString()}
                onValueChange={(v) => setFormData({ ...formData, priority: parseInt(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">Rating (1-5)</Label>
              <Select
                value={formData.rating}
                onValueChange={(v) => setFormData({ ...formData, rating: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <SelectItem key={r} value={r.toString()}>{r} Star{r > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Assigned To</Label>
              <Select
                value={formData.assigned_to}
                onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                <SelectContent>
                  {staffMembers.map((member) => (
                    <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Address Fields */}
          <div className="space-y-3">
            {addressFields.map((field, index) => (
              <div key={field.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={field.id}>
                    {index === 0 ? "Address" : `Address ${index + 1}`}
                  </Label>
                  {index === 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAddressField(field.id)}
                      className="h-6 text-destructive hover:text-destructive"
                    >
                      <Minus className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
                <Input
                  id={field.id}
                  value={field.value}
                  onChange={(e) => handleAddressChange(field.id, e.target.value)}
                  placeholder="Full address"
                />
              </div>
            ))}
            {canAddMoreAddresses && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addAddressField}
                className="text-primary"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Another Address
              </Button>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this professional..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !formData.name.trim() ||
              !phoneFields[0]?.value ||
              hasDuplicates ||
              emailWebsiteErrors.length > 0
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : editingProfessional ? (
              "Update Professional"
            ) : (
              "Add Professional"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
