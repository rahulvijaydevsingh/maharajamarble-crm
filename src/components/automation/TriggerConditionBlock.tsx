import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2, Zap, Clock, Hash, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EntityType, TriggerType, ConditionLogic, EntityField } from "@/types/automation";
import { 
  TRIGGER_TYPES, 
  ENTITY_FIELDS, 
  FIELD_CHANGE_WHEN_OPTIONS, 
  TIME_OFFSET_UNITS, 
  TIME_OFFSET_DIRECTIONS, 
  SAVED_FILTER_CONDITIONS,
  CHECK_FREQUENCY_OPTIONS,
  THRESHOLD_OPERATORS
} from "@/constants/automationConstants";
import { FieldValueSelector } from "./triggers/FieldValueSelector";

export interface TriggerConditionData {
  id: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
}

interface TriggerConditionBlockProps {
  condition: TriggerConditionData;
  conditionIndex: number;
  entityType: EntityType;
  savedFilters: Array<{ id: string; name: string; is_shared?: boolean }>;
  onUpdate: (id: string, updates: Partial<TriggerConditionData>) => void;
  onRemove: (id: string) => void;
  showLogic: boolean;
  logic: ConditionLogic;
  onLogicChange: (logic: ConditionLogic) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const TriggerConditionBlock = ({
  condition,
  conditionIndex,
  entityType,
  savedFilters,
  onUpdate,
  onRemove,
  showLogic,
  logic,
  onLogicChange,
  isExpanded,
  onToggleExpand,
}: TriggerConditionBlockProps) => {
  const entityFields = ENTITY_FIELDS[entityType] || [];
  const selectedField = entityFields.find(f => f.name === condition.triggerConfig.field);

  const getTriggerIcon = (type: TriggerType) => {
    switch (type) {
      case "field_change": return <Zap className="h-4 w-4" />;
      case "time_based": return <Clock className="h-4 w-4" />;
      case "count_based": return <Hash className="h-4 w-4" />;
      case "saved_filter": return <Filter className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const getTriggerSummary = () => {
    const { triggerType, triggerConfig } = condition;
    switch (triggerType) {
      case "field_change":
        if (triggerConfig.when === "field_changes_to" && triggerConfig.field) {
          return `${triggerConfig.field} changes to ${triggerConfig.value || "..."}`;
        }
        if (triggerConfig.when === "field_changes_from_to" && triggerConfig.field) {
          return `${triggerConfig.field}: ${triggerConfig.from_value || "any"} → ${triggerConfig.to_value || "..."}`;
        }
        if (triggerConfig.when === "record_created") {
          return "Record created";
        }
        return "Field change";
      case "time_based":
        if (triggerConfig.offset_value && triggerConfig.field) {
          return `${triggerConfig.offset_value} ${triggerConfig.offset_unit || "days"} ${triggerConfig.offset_direction || "after"} ${triggerConfig.field}`;
        }
        return "Time-based";
      case "count_based":
        if (triggerConfig.threshold_value) {
          return `Count ${triggerConfig.threshold_operator || ">"} ${triggerConfig.threshold_value}`;
        }
        return "Count-based";
      case "saved_filter":
        return triggerConfig.saved_filter_id ? "Saved filter trigger" : "Saved Filter";
      default:
        return "Configure trigger...";
    }
  };

  return (
    <div className="space-y-2">
      {/* AND/OR Logic selector - shown between conditions */}
      {showLogic && (
        <div className="flex items-center justify-center py-2">
          <div className="flex items-center gap-3 px-4 py-1.5 bg-muted rounded-full">
            <RadioGroup
              value={logic}
              onValueChange={(v) => onLogicChange(v as ConditionLogic)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="and" id={`logic-and-${condition.id}`} className="h-4 w-4" />
                <Label htmlFor={`logic-and-${condition.id}`} className="text-sm font-semibold cursor-pointer">AND</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="or" id={`logic-or-${condition.id}`} className="h-4 w-4" />
                <Label htmlFor={`logic-or-${condition.id}`} className="text-sm font-semibold cursor-pointer">OR</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      )}

      <Card className="border-2 border-dashed">
        <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer hover:bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {conditionIndex + 1}
                  </Badge>
                  {getTriggerIcon(condition.triggerType)}
                  <span className="font-medium">
                    {TRIGGER_TYPES.find(t => t.value === condition.triggerType)?.label}
                  </span>
                  {!isExpanded && (
                    <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
                      {getTriggerSummary()}
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-1">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {conditionIndex > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(condition.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {/* Trigger Type Selector */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Trigger Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_TYPES.map(t => (
                    <Button
                      key={t.value}
                      variant={condition.triggerType === t.value ? "default" : "outline"}
                      className="justify-start h-auto py-2 px-3"
                      onClick={() => onUpdate(condition.id, { 
                        triggerType: t.value, 
                        triggerConfig: {} 
                      })}
                    >
                      <div className="text-left w-full overflow-hidden">
                        <div className="font-medium text-xs">{t.label}</div>
                        <div className="text-[10px] opacity-70 truncate">{t.description}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Field Change Config */}
              {condition.triggerType === "field_change" && (
                <div className="space-y-3 pt-2 border-t">
                  <Select
                    value={condition.triggerConfig.when || ""}
                    onValueChange={(v) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, when: v } 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select when to trigger..." />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_CHANGE_WHEN_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(condition.triggerConfig.when === "field_changes_to" || condition.triggerConfig.when === "record_created") && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Select Field</Label>
                        <Select
                          value={condition.triggerConfig.field || ""}
                          onValueChange={(v) => onUpdate(condition.id, { 
                            triggerConfig: { ...condition.triggerConfig, field: v, value: "" } 
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field..." />
                          </SelectTrigger>
                          <SelectContent>
                            {entityFields.map(f => (
                              <SelectItem key={f.name} value={f.name}>
                                <div className="flex items-center gap-2">
                                  <span>{f.label}</span>
                                  <Badge variant="outline" className="text-[10px]">{f.type}</Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {condition.triggerConfig.field && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Value to match</Label>
                          <FieldValueSelector
                            field={selectedField}
                            value={condition.triggerConfig.value}
                            onChange={(v) => onUpdate(condition.id, { 
                              triggerConfig: { ...condition.triggerConfig, value: v } 
                            })}
                            placeholder="Select or enter value..."
                          />
                        </div>
                      )}
                    </>
                  )}

                  {condition.triggerConfig.when === "field_changes_from_to" && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Select Field</Label>
                        <Select
                          value={condition.triggerConfig.field || ""}
                          onValueChange={(v) => onUpdate(condition.id, { 
                            triggerConfig: { ...condition.triggerConfig, field: v, from_value: "", to_value: "" } 
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field..." />
                          </SelectTrigger>
                          <SelectContent>
                            {entityFields.map(f => (
                              <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {condition.triggerConfig.field && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">From</Label>
                            <FieldValueSelector
                              field={selectedField}
                              value={condition.triggerConfig.from_value}
                              onChange={(v) => onUpdate(condition.id, { 
                                triggerConfig: { ...condition.triggerConfig, from_value: v } 
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">To</Label>
                            <FieldValueSelector
                              field={selectedField}
                              value={condition.triggerConfig.to_value}
                              onChange={(v) => onUpdate(condition.id, { 
                                triggerConfig: { ...condition.triggerConfig, to_value: v } 
                              })}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Time Based Config */}
              {condition.triggerType === "time_based" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      value={condition.triggerConfig.offset_value || ""}
                      onChange={(e) => onUpdate(condition.id, { 
                        triggerConfig: { ...condition.triggerConfig, offset_value: parseInt(e.target.value) } 
                      })}
                      placeholder="Value"
                    />
                    <Select
                      value={condition.triggerConfig.offset_unit || "days"}
                      onValueChange={(v) => onUpdate(condition.id, { 
                        triggerConfig: { ...condition.triggerConfig, offset_unit: v } 
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_OFFSET_UNITS.map(u => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={condition.triggerConfig.offset_direction || "after"}
                      onValueChange={(v) => onUpdate(condition.id, { 
                        triggerConfig: { ...condition.triggerConfig, offset_direction: v } 
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_OFFSET_DIRECTIONS.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Select
                    value={condition.triggerConfig.field || ""}
                    onValueChange={(v) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, field: v } 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Relative to field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {entityFields.filter(f => f.type === "date" || f.type === "datetime").map(f => (
                        <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Count Based Config */}
              {condition.triggerType === "count_based" && (
                <div className="space-y-3 pt-2 border-t">
                  <Select
                    value={condition.triggerConfig.threshold_operator || "greater_than"}
                    onValueChange={(v) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, threshold_operator: v } 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Condition..." />
                    </SelectTrigger>
                    <SelectContent>
                      {THRESHOLD_OPERATORS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={condition.triggerConfig.threshold_value || ""}
                    onChange={(e) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, threshold_value: parseInt(e.target.value) } 
                    })}
                    placeholder="Threshold count"
                  />
                  <Select
                    value={condition.triggerConfig.check_frequency || "hourly"}
                    onValueChange={(v) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, check_frequency: v } 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Check frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHECK_FREQUENCY_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Saved Filter Config */}
              {condition.triggerType === "saved_filter" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Saved Filter</Label>
                    <Select
                      value={condition.triggerConfig.saved_filter_id || ""}
                      onValueChange={(v) => onUpdate(condition.id, { 
                        triggerConfig: { ...condition.triggerConfig, saved_filter_id: v } 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a saved filter..." />
                      </SelectTrigger>
                      <SelectContent>
                        {savedFilters.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            No saved filters found for {entityType}
                          </div>
                        ) : (
                          savedFilters.map(filter => (
                            <SelectItem key={filter.id} value={filter.id}>
                              <div className="flex items-center gap-2">
                                <Filter className="h-3 w-3" />
                                {filter.name}
                                {filter.is_shared && <Badge variant="secondary" className="text-[10px]">Shared</Badge>}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Select
                    value={condition.triggerConfig.condition || "count_above"}
                    onValueChange={(v) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, condition: v } 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAVED_FILTER_CONDITIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(condition.triggerConfig.condition === "count_above" || 
                    condition.triggerConfig.condition === "count_below" || 
                    condition.triggerConfig.condition === "count_changes_by") && (
                    <Input
                      type="number"
                      value={condition.triggerConfig.threshold || ""}
                      onChange={(e) => onUpdate(condition.id, { 
                        triggerConfig: { ...condition.triggerConfig, threshold: parseInt(e.target.value) } 
                      })}
                      placeholder="Threshold value"
                    />
                  )}
                  <Select
                    value={condition.triggerConfig.check_frequency || "hourly"}
                    onValueChange={(v) => onUpdate(condition.id, { 
                      triggerConfig: { ...condition.triggerConfig, check_frequency: v } 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Check frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHECK_FREQUENCY_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
};
