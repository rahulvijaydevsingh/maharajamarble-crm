import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EntityField } from "@/types/automation";

interface FieldValueSelectorProps {
  field: EntityField | undefined;
  value: any;
  onChange: (value: any) => void;
  placeholder?: string;
}

export const FieldValueSelector = ({ field, value, onChange, placeholder }: FieldValueSelectorProps) => {
  if (!field) {
    return (
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter value..."}
      />
    );
  }

  // Select/dropdown fields - show dropdown with options
  if ((field.type === "select" || field.type === "array") && field.options && field.options.length > 0) {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${field.label}...`} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Boolean fields - show checkbox
  if (field.type === "boolean") {
    return (
      <div className="flex items-center space-x-2 h-10">
        <Checkbox
          id="field-value"
          checked={value === true || value === "true"}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <Label htmlFor="field-value">True / Enabled</Label>
      </div>
    );
  }

  // Number fields - show number input
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || `Enter ${field.label}...`}
      />
    );
  }

  // Date/datetime fields - show date picker
  if (field.type === "date" || field.type === "datetime") {
    return (
      <Input
        type={field.type === "date" ? "date" : "datetime-local"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Default: text input
  return (
    <Input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || `Enter ${field.label}...`}
    />
  );
};