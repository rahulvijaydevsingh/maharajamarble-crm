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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2, Plus, GripVertical, Copy } from "lucide-react";
import { SavedFilter, FilterConfig, SavedFilterInsert } from "@/hooks/useSavedFilters";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueDate?: Date;
  logic: "and" | "or"; // Logic operator AFTER this rule
}

interface SavedFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (filter: SavedFilterInsert) => Promise<any>;
  onUpdate?: (id: string, filter: Partial<SavedFilterInsert>) => Promise<any>;
  editingFilter?: SavedFilter | null;
  uniqueSources: string[];
  uniqueAssignedTo: string[];
  uniqueMaterials: string[];
}

// Organized field options by category
const FIELD_OPTIONS = [
  // Basic Information
  { value: "name", label: "Name", type: "text", category: "Basic Information" },
  { value: "phone", label: "Phone", type: "text", category: "Basic Information" },
  { value: "email", label: "Email", type: "text", category: "Basic Information" },
  { value: "firm_name", label: "Company", type: "text", category: "Basic Information" },
  { value: "address", label: "Address", type: "text", category: "Basic Information" },
  { value: "site_location", label: "Site Location", type: "text", category: "Basic Information" },
  
  // Lead Classification
  { value: "status", label: "Status", type: "select", category: "Lead Classification" },
  { value: "priority", label: "Priority", type: "select", category: "Lead Classification" },
  { value: "source", label: "Source", type: "select", category: "Lead Classification" },
  { value: "materials", label: "Materials", type: "select", category: "Lead Classification" },
  { value: "construction_stage", label: "Construction Stage", type: "select", category: "Lead Classification" },
  { value: "estimated_quantity", label: "Estimated Quantity", type: "number", category: "Lead Classification" },
  
  // Assignment & Ownership
  { value: "assigned_to", label: "Assigned To", type: "select", category: "Assignment" },
  { value: "created_by", label: "Created By", type: "text", category: "Assignment" },
  
  // Dates & Timeline
  { value: "created_at", label: "Date Created", type: "date", category: "Dates" },
  { value: "next_follow_up", label: "Next Follow Up", type: "date", category: "Dates" },
  { value: "last_follow_up", label: "Last Follow Up", type: "date", category: "Dates" },
  
  // Task Information
  { value: "pending_tasks", label: "Pending Tasks Count", type: "number", category: "Tasks" },
];

// Operators by field type
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
    { value: "next_7_days", label: "next 7 days" },
    { value: "next_30_days", label: "next 30 days" },
  ],
};

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "in-progress", label: "In Progress" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "on-hold", label: "On Hold" },
];

const PRIORITY_OPTIONS = [
  { value: "1", label: "Very High" },
  { value: "2", label: "High" },
  { value: "3", label: "Medium" },
  { value: "4", label: "Low" },
  { value: "5", label: "Very Low" },
];

const CONSTRUCTION_STAGES = [
  { value: "excavation", label: "Excavation" },
  { value: "structure_complete", label: "Structure Complete" },
  { value: "plastering", label: "Plastering" },
  { value: "flooring_ready", label: "Flooring Ready" },
  { value: "renovation", label: "Renovation" },
];

export function SavedFilterDialog({
  open,
  onOpenChange,
  onSave,
  onUpdate,
  editingFilter,
  uniqueSources,
  uniqueAssignedTo,
  uniqueMaterials,
}: SavedFilterDialogProps) {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [filterName, setFilterName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [saveFilter, setSaveFilter] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingFilter) {
      setFilterName(editingFilter.name);
      setIsShared(editingFilter.is_shared);
      setIsDefault(editingFilter.is_default);
      
      // Convert filter_config to rules with per-rule logic
      const config = editingFilter.filter_config;
      const newRules: FilterRule[] = [];
      
      // Parse existing filters into rules
      if (config.statusFilter?.length > 0) {
        config.statusFilter.forEach((v, i) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "status", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      if (config.priorityFilter?.length > 0) {
        config.priorityFilter.forEach((v) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "priority", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      if (config.sourceFilter?.length > 0) {
        config.sourceFilter.forEach((v) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "source", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      if (config.assignedToFilter?.length > 0) {
        config.assignedToFilter.forEach((v) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "assigned_to", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      if (config.materialsFilter?.length > 0) {
        config.materialsFilter.forEach((v) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "materials", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      
      // Load advanced rules if they exist
      if (config.advancedRules?.length > 0) {
        config.advancedRules.forEach((rule: any) => {
          newRules.push({
            id: crypto.randomUUID(),
            field: rule.field,
            operator: rule.operator,
            value: rule.value,
            logic: rule.logic || "and",
          });
        });
      }
      
      setRules(newRules.length > 0 ? newRules : [createEmptyRule()]);
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
    setSaveFilter(true);
  };

  const addRule = () => {
    setRules([...rules, createEmptyRule()]);
  };

  const duplicateRule = (index: number) => {
    const ruleToCopy = rules[index];
    const newRule = { ...ruleToCopy, id: crypto.randomUUID() };
    const newRules = [...rules];
    newRules.splice(index + 1, 0, newRule);
    setRules(newRules);
  };

  const removeRule = (id: string) => {
    if (rules.length > 1) {
      setRules(rules.filter((r) => r.id !== id));
    }
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const getFieldConfig = (field: string) => {
    return FIELD_OPTIONS.find((f) => f.value === field);
  };

  const getFieldType = (field: string) => {
    return getFieldConfig(field)?.type || "text";
  };

  const getOperators = (field: string) => {
    const type = getFieldType(field) as keyof typeof OPERATORS;
    return OPERATORS[type] || OPERATORS.text;
  };

  const getValueOptions = (field: string) => {
    switch (field) {
      case "status":
        return STATUS_OPTIONS;
      case "priority":
        return PRIORITY_OPTIONS;
      case "source":
        return uniqueSources.map((s) => ({ value: s, label: s }));
      case "assigned_to":
        return uniqueAssignedTo.map((a) => ({ value: a, label: a }));
      case "materials":
        return uniqueMaterials.map((m) => ({ value: m, label: m }));
      case "construction_stage":
        return CONSTRUCTION_STAGES;
      default:
        return [];
    }
  };

  const needsValueInput = (operator: string) => {
    return !["is_empty", "is_not_empty", "today", "this_week", "this_month", "last_7_days", "last_30_days", "next_7_days", "next_30_days"].includes(operator);
  };

  const buildFilterConfig = (): FilterConfig => {
    const config: FilterConfig = {
      statusFilter: [],
      assignedToFilter: [],
      sourceFilter: [],
      priorityFilter: [],
      materialsFilter: [],
      createdDateRange: { from: null, to: null },
      lastFollowUpRange: { from: null, to: null },
      nextFollowUpRange: { from: null, to: null },
      advancedRules: [],
    };

    rules.forEach((rule) => {
      if (!rule.field) return;

      // Store all rules in advancedRules for complex logic
      config.advancedRules = config.advancedRules || [];
      config.advancedRules.push({
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        logic: rule.logic,
      });

      // Also populate legacy filter arrays for backward compatibility
      if (rule.operator === "equals" && rule.value) {
        switch (rule.field) {
          case "status":
            if (!config.statusFilter.includes(rule.value)) {
              config.statusFilter.push(rule.value);
            }
            break;
          case "priority":
            if (!config.priorityFilter.includes(rule.value)) {
              config.priorityFilter.push(rule.value);
            }
            break;
          case "source":
            if (!config.sourceFilter.includes(rule.value)) {
              config.sourceFilter.push(rule.value);
            }
            break;
          case "assigned_to":
            if (!config.assignedToFilter.includes(rule.value)) {
              config.assignedToFilter.push(rule.value);
            }
            break;
          case "materials":
            if (!config.materialsFilter.includes(rule.value)) {
              config.materialsFilter.push(rule.value);
            }
            break;
        }
      }
    });

    return config;
  };

  const handleSubmit = async () => {
    if (!filterName.trim() && saveFilter) {
      return;
    }

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
      } else if (saveFilter) {
        await onSave({
          name: filterName,
          filter_config: filterConfig,
          is_shared: isShared,
          is_default: isDefault,
        });
      }

      onOpenChange(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group fields by category
  const groupedFields = FIELD_OPTIONS.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof FIELD_OPTIONS>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingFilter ? "Edit Filter" : "Create Filter"}</DialogTitle>
          <DialogDescription>
            {editingFilter ? "Modify your saved filter rules." : "Create filter rules with advanced logic to save and apply later."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {/* Add Rule Select */}
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
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={addRule}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Rules List with per-rule AND/OR */}
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {rules.map((rule, index) => (
              <div key={rule.id} className="space-y-2">
                {/* Logic operator between rules */}
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

                {/* Rule Row */}
                <div className={cn(
                  "flex items-center gap-2 p-3 border rounded-lg transition-colors",
                  rule.field ? "bg-card" : "bg-muted/30"
                )}>
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                  
                  {rule.field ? (
                    <>
                      {/* Field Label */}
                      <span className="text-sm font-medium min-w-[100px] shrink-0">
                        {getFieldConfig(rule.field)?.label}
                      </span>

                      {/* Operator Select */}
                      <Select
                        value={rule.operator}
                        onValueChange={(v) => updateRule(rule.id, { operator: v })}
                      >
                        <SelectTrigger className="w-[140px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getOperators(rule.field).map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Value Input - only show if operator needs it */}
                      {needsValueInput(rule.operator) && (
                        <>
                          {getFieldType(rule.field) === "select" ? (
                            <Select
                              value={rule.value}
                              onValueChange={(v) => updateRule(rule.id, { value: v })}
                            >
                              <SelectTrigger className="flex-1 min-w-[120px]">
                                <SelectValue placeholder="Select value" />
                              </SelectTrigger>
                              <SelectContent>
                                {getValueOptions(rule.field).map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : getFieldType(rule.field) === "date" ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "flex-1 min-w-[120px] justify-start text-left font-normal",
                                    !rule.value && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {rule.value ? format(new Date(rule.value), "PPP") : "Pick a date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={rule.value ? new Date(rule.value) : undefined}
                                  onSelect={(date) => updateRule(rule.id, { value: date?.toISOString() || "" })}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Input
                              className="flex-1 min-w-[120px]"
                              placeholder="Enter value"
                              type={getFieldType(rule.field) === "number" ? "number" : "text"}
                              value={rule.value}
                              onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                            />
                          )}
                        </>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => duplicateRule(index)}
                          className="h-8 w-8"
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRule(rule.id)}
                          disabled={rules.length === 1}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Select a field to add a rule</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Filter Name */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="filter-name" className="text-sm">
              <span className="text-destructive">*</span> Filter name
            </Label>
            <Input
              id="filter-name"
              placeholder="Enter filter name"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-filter"
                checked={isShared}
                onCheckedChange={(checked) => setIsShared(checked === true)}
              />
              <Label htmlFor="share-filter" className="text-sm">
                Share with other team members?
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="default-filter"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              <Label htmlFor="default-filter" className="text-sm">
                Mark as default (auto-apply on page load)
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="save-filter" className="text-sm">
              Save Filter
            </Label>
            <Switch
              id="save-filter"
              checked={saveFilter}
              onCheckedChange={setSaveFilter}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || (saveFilter && !filterName.trim())}>
              {editingFilter ? "Update" : saveFilter ? "Apply & Save" : "Apply"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
