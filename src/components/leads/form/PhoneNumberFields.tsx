
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus } from "lucide-react";
import { PhoneField } from "@/types/lead";

interface PhoneNumberFieldsProps {
  phoneFields: PhoneField[];
  validationErrors: { [key: string]: string };
  onPhoneChange: (id: string, value: string) => void;
  onAddField: () => void;
  onRemoveField: (id: string) => void;
}

export function PhoneNumberFields({
  phoneFields,
  validationErrors,
  onPhoneChange,
  onAddField,
  onRemoveField
}: PhoneNumberFieldsProps) {
  return (
    <div className="space-y-2">
      <Label>Phone Numbers *</Label>
      {phoneFields.map((field, index) => (
        <div key={field.id} className="flex items-center space-x-2">
          <div className="flex-1">
            <Input
              type="tel"
              value={field.value}
              onChange={(e) => onPhoneChange(field.id, e.target.value)}
              placeholder={index === 0 ? "Primary Phone Number" : `Phone Number ${index + 1}`}
              className={!field.isValid ? "border-red-500" : field.value && field.isValid ? "border-green-500" : ""}
              maxLength={10}
            />
            {!field.isValid && field.error && (
              <p className="text-sm text-red-500 mt-1">{field.error}</p>
            )}
          </div>
          {index === 0 && phoneFields.length < 4 && (
            <Button type="button" variant="outline" size="icon" onClick={onAddField}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          {index > 0 && (
            <Button type="button" variant="outline" size="icon" onClick={() => onRemoveField(field.id)}>
              <Minus className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {validationErrors.phone && (
        <p className="text-sm text-red-500">{validationErrors.phone}</p>
      )}
    </div>
  );
}
