
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { PhoneNumberFields } from "./PhoneNumberFields";
import { PhoneField, LeadFormData } from "@/types/lead";

interface ContactInformationSectionProps {
  formData: LeadFormData;
  phoneFields: PhoneField[];
  validationErrors: { [key: string]: string };
  duplicateCheck: boolean;
  duplicateWarning: string | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPhoneChange: (id: string, value: string) => void;
  onAddPhoneField: () => void;
  onRemovePhoneField: (id: string) => void;
  onDuplicateCheckChange: (checked: boolean) => void;
  validateEmail: (email: string) => boolean;
}

export function ContactInformationSection({
  formData,
  phoneFields,
  validationErrors,
  duplicateCheck,
  duplicateWarning,
  onInputChange,
  onPhoneChange,
  onAddPhoneField,
  onRemovePhoneField,
  onDuplicateCheckChange,
  validateEmail
}: ContactInformationSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Contact Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={onInputChange}
            placeholder="Enter full name"
            className={validationErrors.name ? "border-red-500" : ""}
            required
          />
          {validationErrors.name && (
            <p className="text-sm text-red-500">{validationErrors.name}</p>
          )}
        </div>

        {/* Phone Numbers */}
        <PhoneNumberFields
          phoneFields={phoneFields}
          validationErrors={validationErrors}
          onPhoneChange={onPhoneChange}
          onAddField={onAddPhoneField}
          onRemoveField={onRemovePhoneField}
        />

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={onInputChange}
            placeholder="Enter email address"
            className={validationErrors.email ? "border-red-500" : formData.email && validateEmail(formData.email) ? "border-green-500" : ""}
          />
          {validationErrors.email && (
            <p className="text-sm text-red-500">{validationErrors.email}</p>
          )}
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            name="address"
            value={formData.address}
            onChange={onInputChange}
            placeholder="Enter complete address"
            rows={2}
          />
        </div>

        {/* Duplicate Check */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="duplicateCheck"
            checked={duplicateCheck}
            onCheckedChange={(checked) => onDuplicateCheckChange(checked === true)}
          />
          <Label htmlFor="duplicateCheck" className="text-sm">
            Check for existing records
          </Label>
        </div>

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">{duplicateWarning}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
