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

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueDate?: Date;
  logic: "and" | "or";
}

interface TaskSavedFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (filter: SavedFilterInsert) => Promise<any>;
  onUpdate?: (id: string, filter: Partial<SavedFilterInsert>) => Promise<any>;
  editingFilter?: SavedFilter | null;
  uniqueTypes: string[];
  uniqueAssignedTo: string[];
}

// Task-specific field options
const FIELD_OPTIONS = [
  // Basic Information
  { value: "title", label: "Task Title", type: "text", category: "Basic Information" },
  { value: "description", label: "Description", type: "text", category: "Basic Information" },
  
  // Task Classification
  { value: "status", label: "Status", type: "select", category: "Task Classification" },
  { value: "priority", label: "Priority", type: "select", category: "Task Classification" },
  { value: "type", label: "Task Type", type: "select", category: "Task Classification" },
  { value: "is_starred", label: "Starred", type: "boolean", category: "Task Classification" },
  { value: "is_overdue", label: "Overdue", type: "boolean", category: "Task Classification" },
  
  // Recurrence
  { value: "is_recurring", label: "Recurring", type: "boolean", category: "Recurrence" },
  { value: "recurrence_frequency", label: "Recurrence Pattern", type: "select", category: "Recurrence" },
  
  // Subtasks
  { value: "has_subtasks", label: "Has Subtasks", type: "boolean", category: "Subtasks" },
  { value: "subtasks_status", label: "Subtasks Completion", type: "select", category: "Subtasks" },
  
  // Assignment
  { value: "assigned_to", label: "Assigned To", type: "select", category: "Assignment" },
  { value: "created_by", label: "Created By", type: "text", category: "Assignment" },
  
  // Dates
  { value: "due_date", label: "Due Date", type: "date", category: "Dates" },
  { value: "created_at", label: "Created Date", type: "date", category: "Dates" },
  { value: "snoozed_until", label: "Snoozed Until", type: "date", category: "Dates" },
  
  // Relationship
  { value: "related_entity_type", label: "Related To Type", type: "select", category: "Relationship" },
  { value: "lead_id", label: "Has Related Lead", type: "boolean", category: "Relationship" },
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
    { value: "overdue", label: "is overdue" },
  ],
  boolean: [
    { value: "is_true", label: "Yes" },
    { value: "is_false", label: "No" },
  ],
};

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "Overdue", label: "Overdue" },
];

const PRIORITY_OPTIONS = [
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const TYPE_OPTIONS = [
  { value: "Follow-up Call", label: "Follow-up Call" },
  { value: "Follow-up Meeting", label: "Follow-up Meeting" },
  { value: "Sample Delivery", label: "Sample Delivery" },
  { value: "Site Visit", label: "Site Visit" },
  { value: "Quotation Preparation", label: "Quotation Preparation" },
  { value: "Feedback Collection", label: "Feedback Collection" },
  { value: "Other", label: "Other" },
];

const RECURRENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const SUBTASKS_STATUS_OPTIONS = [
  { value: "all_complete", label: "All Complete" },
  { value: "partial", label: "Partially Complete" },
  { value: "none_complete", label: "None Complete" },
];

const RELATED_ENTITY_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "professional", label: "Professional" },
  { value: "customer", label: "Customer" },
];

export function TaskSavedFilterDialog({
  open,
  onOpenChange,
  onSave,
  onUpdate,
  editingFilter,
  uniqueTypes,
  uniqueAssignedTo,
}: TaskSavedFilterDialogProps) {
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
      const newRules: FilterRule[] = [];
      
      // Parse status filters
      if (config.statusFilter?.length > 0) {
        config.statusFilter.forEach((v) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "status", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      // Parse priority filters
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
      // Parse type filters (using sourceFilter for tasks)
      if (config.sourceFilter?.length > 0) {
        config.sourceFilter.forEach((v) => {
          newRules.push({ 
            id: crypto.randomUUID(), 
            field: "type", 
            operator: "equals", 
            value: v,
            logic: "and"
          });
        });
      }
      // Parse assignee filters
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
      
      // Load advanced rules
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
      case "type":
        return [...TYPE_OPTIONS, ...uniqueTypes.filter(t => !TYPE_OPTIONS.find(o => o.value === t)).map(t => ({ value: t, label: t }))];
      case "assigned_to":
        return uniqueAssignedTo.map((a) => ({ value: a, label: a }));
      case "recurrence_frequency":
        return RECURRENCE_OPTIONS;
      case "subtasks_status":
        return SUBTASKS_STATUS_OPTIONS;
      case "related_entity_type":
        return RELATED_ENTITY_OPTIONS;
      default:
        return [];
    }
  };

  const needsValueInput = (operator: string) => {
    return !["is_empty", "is_not_empty", "today", "this_week", "this_month", "last_7_days", "last_30_days", "next_7_days", "next_30_days", "overdue", "is_true", "is_false"].includes(operator);
  };

  const buildFilterConfig = (): FilterConfig => {
    const config: FilterConfig = {
      statusFilter: [],
      assignedToFilter: [],
      sourceFilter: [], // Used for task types
      priorityFilter: [],
      materialsFilter: [],
      createdDateRange: { from: null, to: null },
      lastFollowUpRange: { from: null, to: null },
      nextFollowUpRange: { from: null, to: null },
      advancedRules: [],
    };

    rules.forEach((rule) => {
      if (!rule.field) return;

      config.advancedRules = config.advancedRules || [];
      config.advancedRules.push({
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        logic: rule.logic,
      });

      // Populate legacy arrays for backward compatibility
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
          case "type":
            if (!config.sourceFilter.includes(rule.value)) {
              config.sourceFilter.push(rule.value);
            }
            break;
          case "assigned_to":
            if (!config.assignedToFilter.includes(rule.value)) {
              config.assignedToFilter.push(rule.value);
            }
            break;
        }
      }
    });

    return config;
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
          <DialogTitle>{editingFilter ? "Edit Filter" : "Create Task Filter"}</DialogTitle>
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

          {/* Rules List */}
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
                  {/* Field Select */}
                  <Select value={rule.field} onValueChange={(v) => updateRule(rule.id, { field: v, operator: "equals", value: "" })}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Field" />
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

                  {/* Operator Select */}
                  {rule.field && (
                    <Select value={rule.operator} onValueChange={(v) => updateRule(rule.id, { operator: v, value: "" })}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {getOperators(rule.field).map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Value Input */}
                  {rule.field && needsValueInput(rule.operator) && (
                    <>
                      {getFieldType(rule.field) === "select" ? (
                        <Select value={rule.value} onValueChange={(v) => updateRule(rule.id, { value: v })}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Value" />
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
                            <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !rule.value && "text-muted-foreground")}>
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
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          placeholder="Value"
                          className="flex-1"
                        />
                      )}
                    </>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => duplicateRule(index)} className="h-8 w-8">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeRule(rule.id)}
                      disabled={rules.length === 1}
                      className="h-8 w-8 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter Settings */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="filterName">Filter Name *</Label>
              <Input
                id="filterName"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Enter filter name..."
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Share with team</Label>
                <p className="text-xs text-muted-foreground">Make this filter available to all team members</p>
              </div>
              <Switch checked={isShared} onCheckedChange={setIsShared} />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Set as default</Label>
                <p className="text-xs text-muted-foreground">Apply this filter automatically when loading tasks</p>
              </div>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!filterName.trim() || isSubmitting}>
            {isSubmitting ? "Saving..." : editingFilter ? "Update Filter" : "Save Filter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
