import React, { useState, useEffect } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2, Plus, Copy } from "lucide-react";
import { SavedFilter, FilterConfig, SavedFilterInsert } from "@/hooks/useSavedFilters";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROFESSIONAL_TYPES, PROFESSIONAL_STATUSES, SERVICE_CATEGORIES, CITIES, PRIORITIES } from "@/constants/professionalConstants";

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueDate?: Date;
  logic: "and" | "or";
}

interface ProfessionalSavedFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (filter: SavedFilterInsert) => Promise<any>;
  onUpdate?: (id: string, filter: Partial<SavedFilterInsert>) => Promise<any>;
  editingFilter?: SavedFilter | null;
  uniqueAssignedTo: string[];
  uniqueCities: string[];
}

const FIELD_OPTIONS = [
  { value: "name", label: "Name", type: "text", category: "Basic Information" },
  { value: "phone", label: "Phone", type: "text", category: "Basic Information" },
  { value: "email", label: "Email", type: "text", category: "Basic Information" },
  { value: "firm_name", label: "Firm Name", type: "text", category: "Basic Information" },
  { value: "address", label: "Address", type: "text", category: "Basic Information" },
  { value: "city", label: "City", type: "select", category: "Basic Information" },
  { value: "professional_type", label: "Professional Type", type: "select", category: "Classification" },
  { value: "service_category", label: "Service Category", type: "select", category: "Classification" },
  { value: "status", label: "Status", type: "select", category: "Classification" },
  { value: "priority", label: "Priority", type: "select", category: "Classification" },
  { value: "rating", label: "Rating", type: "number", category: "Classification" },
  { value: "total_projects", label: "Total Projects", type: "number", category: "Classification" },
  { value: "assigned_to", label: "Assigned To", type: "select", category: "Assignment" },
  { value: "created_at", label: "Date Created", type: "date", category: "Dates" },
  { value: "next_follow_up", label: "Next Follow Up", type: "date", category: "Dates" },
  { value: "last_follow_up", label: "Last Follow Up", type: "date", category: "Dates" },
];

const OPERATORS = {
  text: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "not equals" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  select: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "not equals" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "not equals" },
    { value: "greater_than", label: "greater than" },
    { value: "less_than", label: "less than" },
    { value: "greater_or_equal", label: "greater than or equal" },
    { value: "less_or_equal", label: "less than or equal" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  date: [
    { value: "equals", label: "equals" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
    { value: "today", label: "is today" },
    { value: "this_week", label: "this week" },
    { value: "this_month", label: "this month" },
    { value: "last_7_days", label: "last 7 days" },
    { value: "last_30_days", label: "last 30 days" },
  ],
};

export function ProfessionalSavedFilterDialog({
  open,
  onOpenChange,
  onSave,
  onUpdate,
  editingFilter,
  uniqueAssignedTo,
  uniqueCities,
}: ProfessionalSavedFilterDialogProps) {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [filterName, setFilterName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingFilter) {
      setFilterName(editingFilter.name);
      setIsShared(editingFilter.is_shared);
      setIsDefault(editingFilter.is_default);
      const config = editingFilter.filter_config;
      const newRules: FilterRule[] = config.advancedRules?.map((rule: any) => ({
        id: crypto.randomUUID(),
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        logic: rule.logic || "and",
      })) || [createEmptyRule()];
      setRules(newRules);
    } else {
      resetForm();
    }
  }, [editingFilter, open]);

  const createEmptyRule = (): FilterRule => ({
    id: crypto.randomUUID(),
    field: "",
    operator: "equals",
    value: "",
    logic: "and",
  });

  const resetForm = () => {
    setRules([createEmptyRule()]);
    setFilterName("");
    setIsShared(false);
    setIsDefault(false);
  };

  const addRule = () => setRules([...rules, createEmptyRule()]);

  const removeRule = (id: string) => {
    if (rules.length > 1) setRules(rules.filter((r) => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const getFieldType = (field: string) => {
    return FIELD_OPTIONS.find((f) => f.value === field)?.type || "text";
  };

  const getOperators = (field: string) => {
    const type = getFieldType(field) as keyof typeof OPERATORS;
    return OPERATORS[type] || OPERATORS.text;
  };

  const getValueOptions = (field: string) => {
    switch (field) {
      case "status":
        return Object.entries(PROFESSIONAL_STATUSES).map(([value, { label }]) => ({ value, label }));
      case "priority":
        return Object.entries(PRIORITIES).map(([value, { label }]) => ({ value, label }));
      case "professional_type":
        return PROFESSIONAL_TYPES;
      case "service_category":
        return SERVICE_CATEGORIES;
      case "city":
        return [...CITIES, ...uniqueCities.filter(c => !CITIES.find(city => city.value === c)).map(c => ({ value: c, label: c }))];
      case "assigned_to":
        return uniqueAssignedTo.map((a) => ({ value: a, label: a }));
      default:
        return [];
    }
  };

  const needsValueInput = (operator: string) => {
    return !["is_empty", "is_not_empty", "today", "this_week", "this_month", "last_7_days", "last_30_days"].includes(operator);
  };

  const buildFilterConfig = (): FilterConfig => {
    return {
      statusFilter: [],
      assignedToFilter: [],
      sourceFilter: [],
      priorityFilter: [],
      materialsFilter: [],
      createdDateRange: { from: null, to: null },
      lastFollowUpRange: { from: null, to: null },
      nextFollowUpRange: { from: null, to: null },
      advancedRules: rules.filter(r => r.field).map((rule) => ({
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        logic: rule.logic,
      })),
    };
  };

  const handleSubmit = async () => {
    if (!filterName.trim()) return;
    setIsSubmitting(true);
    try {
      const filterConfig = buildFilterConfig();
      if (editingFilter && onUpdate) {
        await onUpdate(editingFilter.id, {
          name: filterName,
          filter_config: filterConfig,
          is_shared: isShared,
          is_default: isDefault,
        });
      } else {
        await onSave({
          name: filterName,
          filter_config: filterConfig,
          is_shared: isShared,
          is_default: isDefault,
          entity_type: "professionals",
        });
      }
      onOpenChange(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedFields = FIELD_OPTIONS.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof FIELD_OPTIONS>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingFilter ? "Edit Filter" : "Create Filter"}</DialogTitle>
          <DialogDescription>Create filter rules for professionals.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          <div className="flex gap-2 items-center">
            <Select onValueChange={(field) => {
              if (rules.length === 1 && !rules[0].field) {
                updateRule(rules[0].id, { field });
              } else {
                setRules([...rules, { ...createEmptyRule(), field }]);
              }
            }}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="+ Add Filter Rule" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(groupedFields).map(([category, fields]) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{category}</SelectLabel>
                    {fields.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={addRule}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {rules.map((rule, index) => (
              <div key={rule.id} className="space-y-2">
                {index > 0 && (
                  <div className="flex justify-center">
                    <RadioGroup
                      value={rules[index - 1].logic}
                      onValueChange={(v) => updateRule(rules[index - 1].id, { logic: v as "and" | "or" })}
                      className="flex gap-4 bg-muted/50 rounded-full px-4 py-1"
                    >
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="and" id={`and-${index}`} className="h-3 w-3" />
                        <Label htmlFor={`and-${index}`} className="text-xs font-medium cursor-pointer">AND</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="or" id={`or-${index}`} className="h-3 w-3" />
                        <Label htmlFor={`or-${index}`} className="text-xs font-medium cursor-pointer">OR</Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                <div className={cn("flex items-center gap-2 p-3 border rounded-lg transition-colors", rule.field ? "bg-card" : "bg-muted/30")}>
                  <Select value={rule.field} onValueChange={(v) => updateRule(rule.id, { field: v, operator: "equals", value: "" })}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedFields).map(([category, fields]) => (
                        <SelectGroup key={category}>
                          <SelectLabel>{category}</SelectLabel>
                          {fields.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>

                  {rule.field && (
                    <Select value={rule.operator} onValueChange={(v) => updateRule(rule.id, { operator: v })}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {getOperators(rule.field).map((op) => (
                          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {rule.field && needsValueInput(rule.operator) && (
                    getFieldType(rule.field) === "select" ? (
                      <Select value={rule.value} onValueChange={(v) => updateRule(rule.id, { value: v })}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select value" />
                        </SelectTrigger>
                        <SelectContent>
                          {getValueOptions(rule.field).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : getFieldType(rule.field) === "date" ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !rule.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {rule.value ? format(new Date(rule.value), "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={rule.value ? new Date(rule.value) : undefined} onSelect={(date) => updateRule(rule.id, { value: date?.toISOString() || "" })} />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Input
                        type={getFieldType(rule.field) === "number" ? "number" : "text"}
                        placeholder="Value"
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        className="flex-1"
                      />
                    )
                  )}

                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRule(rule.id)} disabled={rules.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="filterName">Filter Name</Label>
              <Input id="filterName" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Enter filter name" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isShared">Share with team</Label>
              <Switch id="isShared" checked={isShared} onCheckedChange={setIsShared} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault">Set as default filter</Label>
              <Switch id="isDefault" checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !filterName.trim()}>
            {isSubmitting ? "Saving..." : editingFilter ? "Update Filter" : "Save Filter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
