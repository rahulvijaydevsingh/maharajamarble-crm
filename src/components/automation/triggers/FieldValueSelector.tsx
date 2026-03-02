import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EntityField } from "@/types/automation";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { buildStaffGroups } from "@/lib/staffSelect";

interface FieldValueSelectorProps {
  field: EntityField | undefined;
  value: any;
  onChange: (value: any) => void;
  placeholder?: string;
}

export const FieldValueSelector = ({ field, value, onChange, placeholder }: FieldValueSelectorProps) => {
  const { staffMembers } = useActiveStaff();
  const staffGroups = buildStaffGroups(staffMembers);

  if (!field) {
    return (
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter value..."}
      />
    );
  }

  // Dynamic staff selector for assigned_to / created_by fields
  if (field.dynamicOptions === "staff") {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${field.label}...`} />
        </SelectTrigger>
        <SelectContent className="z-[220]">
          {staffGroups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.members.map((member) => (
                <SelectItem key={member.id} value={member.name}>
                  {member._display}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Select/dropdown fields - show dropdown with options
  if ((field.type === "select" || field.type === "array") && field.options && field.options.length > 0) {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${field.label}...`} />
        </SelectTrigger>
        <SelectContent className="z-[220]">
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
