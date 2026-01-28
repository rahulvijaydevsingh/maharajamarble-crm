import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Zap, Bell, Mail, Edit3, Webhook, RefreshCw, ChevronDown, ChevronUp, Play, CheckSquare, AlarmClock, MessageSquare } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AutomationRule, EntityType, TriggerType, ActionType, ConditionLogic } from "@/types/automation";
import { 
  ENTITY_TYPES, 
  ACTION_TYPES, 
  ENTITY_FIELDS, 
  EXECUTION_LIMIT_OPTIONS
} from "@/constants/automationConstants";
import { useCreateAutomationRule, useUpdateAutomationRule } from "@/hooks/useAutomationRules";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { CreateTaskActionConfig } from "./actions/CreateTaskActionConfig";
import { SendNotificationActionConfig } from "./actions/SendNotificationActionConfig";
import { SendMessageActionConfig } from "./actions/SendMessageActionConfig";
import { CreateReminderActionConfig } from "./actions/CreateReminderActionConfig";
import { TriggerAutomationActionConfig } from "./actions/TriggerAutomationActionConfig";
import { FieldValueSelector } from "./triggers/FieldValueSelector";
import { TriggerConditionBlock, TriggerConditionData } from "./TriggerConditionBlock";
import { toast } from "@/hooks/use-toast";

interface InternalAction {
  id: string;
  type: ActionType;
  config: Record<string, any>;
  condition?: any;
  delay_minutes?: number;
  order: number;
}

interface AddAutomationRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule?: AutomationRule | null;
  defaultEntityType?: EntityType;
}

export const AddAutomationRuleDialog = ({
  open,
  onOpenChange,
  editingRule,
  defaultEntityType,
}: AddAutomationRuleDialogProps) => {
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();
  
  const [ruleName, setRuleName] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState<EntityType>(defaultEntityType || "leads");
  const [actions, setActions] = useState<InternalAction[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [executionLimit, setExecutionLimit] = useState("unlimited");
  const [activeDays, setActiveDays] = useState(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const [expandedActions, setExpandedActions] = useState<string[]>([]);
  
  // Multi-condition trigger blocks
  const [triggerConditions, setTriggerConditions] = useState<TriggerConditionData[]>([
    { id: crypto.randomUUID(), triggerType: "field_change", triggerConfig: {} }
  ]);
  const [conditionLogic, setConditionLogic] = useState<ConditionLogic>("and");
  const [expandedConditions, setExpandedConditions] = useState<string[]>([]);

  // Fetch saved filters for the selected entity type
  const { filters: savedFilters } = useSavedFilters(entityType);

  useEffect(() => {
    if (editingRule) {
      setRuleName(editingRule.rule_name);
      setDescription(editingRule.description || "");
      setEntityType(editingRule.entity_type);
      setActions(editingRule.actions as any);
      setIsActive(editingRule.is_active);
      setExecutionLimit(editingRule.execution_limit);
      setActiveDays(editingRule.active_days);
      setExpandedActions(editingRule.actions.map((a: any) => a.id));
      
      // Load trigger conditions - support both old and new format
      const triggerConfig = editingRule.trigger_config as any;
      if (triggerConfig.conditions && Array.isArray(triggerConfig.conditions)) {
        // New format with multiple trigger conditions
        setTriggerConditions(triggerConfig.conditions);
        setExpandedConditions([triggerConfig.conditions[0]?.id]);
      } else {
        // Old format - convert to new format
        setTriggerConditions([{
          id: crypto.randomUUID(),
          triggerType: editingRule.trigger_type,
          triggerConfig: triggerConfig
        }]);
      }
      if (triggerConfig.condition_logic) {
        setConditionLogic(triggerConfig.condition_logic);
      }
    } else {
      resetForm();
    }
  }, [editingRule, open]);

  useEffect(() => {
    // Expand first condition by default when opened
    if (open && triggerConditions.length > 0 && expandedConditions.length === 0) {
      setExpandedConditions([triggerConditions[0].id]);
    }
  }, [open, triggerConditions]);

  const resetForm = () => {
    const initialConditionId = crypto.randomUUID();
    setRuleName("");
    setDescription("");
    setEntityType(defaultEntityType || "leads");
    setTriggerConditions([{ id: initialConditionId, triggerType: "field_change", triggerConfig: {} }]);
    setConditionLogic("and");
    setExpandedConditions([initialConditionId]);
    setActions([]);
    setIsActive(true);
    setExecutionLimit("unlimited");
    setActiveDays(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    setExpandedActions([]);
  };

  // Trigger condition management
  const handleAddCondition = () => {
    const newId = crypto.randomUUID();
    setTriggerConditions([
      ...triggerConditions,
      { id: newId, triggerType: "field_change", triggerConfig: {} }
    ]);
    setExpandedConditions([newId]); // Expand only the new condition
  };

  const handleUpdateCondition = (id: string, updates: Partial<TriggerConditionData>) => {
    setTriggerConditions(triggerConditions.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const handleRemoveCondition = (id: string) => {
    if (triggerConditions.length > 1) {
      setTriggerConditions(triggerConditions.filter(c => c.id !== id));
      setExpandedConditions(expandedConditions.filter(eid => eid !== id));
    }
  };

  const toggleConditionExpanded = (id: string) => {
    if (expandedConditions.includes(id)) {
      setExpandedConditions(expandedConditions.filter(eid => eid !== id));
    } else {
      setExpandedConditions([...expandedConditions, id]);
    }
  };

  // Action management
  const handleAddAction = (type: ActionType) => {
    const newAction: InternalAction = {
      id: crypto.randomUUID(),
      type,
      config: getDefaultActionConfig(type),
      order: actions.length,
    };
    setActions([...actions, newAction]);
    setExpandedActions([...expandedActions, newAction.id]);
  };

  const getDefaultActionConfig = (type: ActionType): Record<string, any> => {
    switch (type) {
      case "create_task":
        return { 
          title: "", 
          type: "Follow-up Call",
          priority: "Medium", 
          assigned_to_type: "trigger.assigned_to",
          due_date_type: "today",
          due_time_type: "relative",
          due_time_offset: 2,
          reminder_enabled: true,
          reminder_before: "15",
          link_to_trigger: true,
          description: ""
        };
      case "create_reminder":
        return {
          title: "",
          description: "",
          reminder_datetime_type: "relative",
          reminder_offset: 1,
          reminder_offset_unit: "days",
          assigned_to_type: "trigger.assigned_to",
          is_recurring: false
        };
      case "send_notification":
        return { 
          notification_type: "in_app", 
          recipients: ["trigger.assigned_to"], 
          title: "", 
          message: "", 
          priority: "normal",
          include_link: true
        };
      case "send_message":
        return { 
          recipient_type: "trigger.assigned_to",
          specific_user_id: "",
          message: "",
          include_record_link: true
        };
      case "update_field":
        return { target: "trigger_record", field: "", value: "" };
      case "send_email":
        return { to: "{{trigger.email}}", subject: "", body: "", send_timing: "immediately" };
      case "execute_webhook":
        return { url: "", method: "POST", payload: {}, retry_logic: "none", error_handling: "ignore" };
      case "trigger_automation":
        return { target_rule_id: "", pass_variables: true };
      default:
        return {};
    }
  };

  const handleRemoveAction = (actionId: string) => {
    setActions(actions.filter(a => a.id !== actionId));
    setExpandedActions(expandedActions.filter(id => id !== actionId));
  };

  const handleUpdateAction = (actionId: string, updates: Partial<InternalAction>) => {
    setActions(actions.map(a => a.id === actionId ? { ...a, ...updates } : a));
  };

  const toggleActionExpanded = (actionId: string) => {
    if (expandedActions.includes(actionId)) {
      setExpandedActions(expandedActions.filter(id => id !== actionId));
    } else {
      setExpandedActions([...expandedActions, actionId]);
    }
  };

  const handleSave = () => {
    // Build the new trigger config with multiple conditions
    const finalTriggerConfig = {
      conditions: triggerConditions,
      condition_logic: conditionLogic
    };

    // Use the first condition's trigger type as the primary (for backward compatibility)
    const primaryTriggerType = triggerConditions[0]?.triggerType || "field_change";

    const ruleData = {
      entity_type: entityType,
      rule_name: ruleName,
      description,
      trigger_type: primaryTriggerType,
      trigger_config: finalTriggerConfig,
      actions: actions as any,
      is_active: isActive,
      execution_limit: executionLimit as any,
      active_days: activeDays,
      execution_order: 0,
      created_by: "System",
    };

    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, ...ruleData } as any, {
        onSuccess: () => onOpenChange(false),
      });
    } else {
      createRule.mutate(ruleData as any, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  const handleTestRule = () => {
    const conditionsSummary = triggerConditions.map((c, i) => {
      const logic = i > 0 ? ` ${conditionLogic.toUpperCase()} ` : "";
      return `${logic}Condition ${i + 1}: ${c.triggerType}`;
    }).join('\n');

    const actionsSummary = actions.map((a, i) => {
      const actionType = ACTION_TYPES.find(at => at.value === a.type);
      return `${i + 1}. ${actionType?.label || a.type}`;
    }).join('\n');

    toast({
      title: "Test Rule Preview",
      description: (
        <div className="space-y-2">
          <p className="text-sm font-medium">Conditions:</p>
          <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
            {conditionsSummary || "No conditions configured"}
          </pre>
          <p className="text-sm font-medium mt-2">Actions:</p>
          <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
            {actionsSummary || "No actions configured"}
          </pre>
          <p className="text-xs text-muted-foreground">
            Note: Test execution requires a live record to trigger against.
          </p>
        </div>
      ),
    });
  };

  const entityFields = ENTITY_FIELDS[entityType] || [];

  const getActionIcon = (type: ActionType) => {
    switch (type) {
      case "create_task": return <CheckSquare className="h-4 w-4" />;
      case "create_reminder": return <AlarmClock className="h-4 w-4" />;
      case "send_notification": return <Bell className="h-4 w-4" />;
      case "send_message": return <MessageSquare className="h-4 w-4" />;
      case "update_field": return <Edit3 className="h-4 w-4" />;
      case "send_email": return <Mail className="h-4 w-4" />;
      case "execute_webhook": return <Webhook className="h-4 w-4" />;
      case "trigger_automation": return <RefreshCw className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{editingRule ? "Edit Automation Rule" : "Create Automation Rule"}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Field Visit Lead → Immediate Call"
                />
              </div>
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Select value={entityType} onValueChange={(v) => {
                  setEntityType(v as EntityType);
                  // Reset all conditions when entity type changes
                  setTriggerConditions([{ 
                    id: crypto.randomUUID(), 
                    triggerType: "field_change", 
                    triggerConfig: {} 
                  }]);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map(e => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this automation does..."
                rows={2}
              />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-6">
              {/* LEFT: Trigger Conditions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    WHEN (Triggers) - Define all conditions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {triggerConditions.map((condition, index) => (
                    <TriggerConditionBlock
                      key={condition.id}
                      condition={condition}
                      conditionIndex={index}
                      entityType={entityType}
                      savedFilters={savedFilters}
                      onUpdate={handleUpdateCondition}
                      onRemove={handleRemoveCondition}
                      showLogic={index > 0}
                      logic={conditionLogic}
                      onLogicChange={setConditionLogic}
                      isExpanded={expandedConditions.includes(condition.id)}
                      onToggleExpand={() => toggleConditionExpanded(condition.id)}
                    />
                  ))}

                  {/* Add Another Condition Button */}
                  <Button
                    variant="outline"
                    className="w-full mt-4 border-dashed border-2"
                    onClick={handleAddCondition}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Condition
                  </Button>

                  {/* Condition Summary */}
                  {triggerConditions.length > 1 && (
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <strong>Summary:</strong> Rule will trigger when{" "}
                        {conditionLogic === "and" ? "ALL" : "ANY"} of the {triggerConditions.length} conditions are met.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* RIGHT: Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5 text-blue-500" />
                    THEN (Actions)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {actions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No actions added yet</p>
                      <p className="text-sm">Add actions below</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {actions.map((action, idx) => (
                        <Collapsible
                          key={action.id}
                          open={expandedActions.includes(action.id)}
                          onOpenChange={() => toggleActionExpanded(action.id)}
                        >
                          <div className="border rounded-lg overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted">
                                <div className="flex items-center gap-2">
                                  {getActionIcon(action.type)}
                                  <Badge variant="secondary">
                                    {idx + 1}. {ACTION_TYPES.find(a => a.value === action.type)?.label}
                                  </Badge>
                                  {action.config.title && (
                                    <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                                      {action.config.title}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {expandedActions.includes(action.id) ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAction(action.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="p-4 border-t">
                                {action.type === "create_task" && (
                                  <CreateTaskActionConfig
                                    config={action.config}
                                    onConfigChange={(newConfig) => handleUpdateAction(action.id, { config: newConfig })}
                                    entityType={entityType}
                                  />
                                )}

                                {action.type === "create_reminder" && (
                                  <CreateReminderActionConfig
                                    config={action.config}
                                    onConfigChange={(newConfig) => handleUpdateAction(action.id, { config: newConfig })}
                                  />
                                )}
                                
                                {action.type === "send_notification" && (
                                  <SendNotificationActionConfig
                                    config={action.config}
                                    onConfigChange={(newConfig) => handleUpdateAction(action.id, { config: newConfig })}
                                  />
                                )}

                                {action.type === "send_message" && (
                                  <SendMessageActionConfig
                                    config={action.config}
                                    onConfigChange={(newConfig) => handleUpdateAction(action.id, { config: newConfig })}
                                  />
                                )}

                                {action.type === "update_field" && (
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <Label>Field to Update</Label>
                                      <Select
                                        value={action.config.field || ""}
                                        onValueChange={(v) => handleUpdateAction(action.id, { config: { ...action.config, field: v } })}
                                      >
                                        <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                                        <SelectContent>
                                          {entityFields.filter(f => f.editable).map(f => (
                                            <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {action.config.field && (
                                      <div className="space-y-2">
                                        <Label>New Value</Label>
                                        <FieldValueSelector
                                          field={entityFields.find(f => f.name === action.config.field)}
                                          value={action.config.value}
                                          onChange={(v) => handleUpdateAction(action.id, { config: { ...action.config, value: v } })}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {action.type === "send_email" && (
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <Label>To</Label>
                                      <Input
                                        value={action.config.to || ""}
                                        onChange={(e) => handleUpdateAction(action.id, { config: { ...action.config, to: e.target.value } })}
                                        placeholder="{{trigger.email}} or email@example.com"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Subject</Label>
                                      <Input
                                        value={action.config.subject || ""}
                                        onChange={(e) => handleUpdateAction(action.id, { config: { ...action.config, subject: e.target.value } })}
                                        placeholder="Email subject..."
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Body</Label>
                                      <Textarea
                                        value={action.config.body || ""}
                                        onChange={(e) => handleUpdateAction(action.id, { config: { ...action.config, body: e.target.value } })}
                                        placeholder="Email body content..."
                                        rows={4}
                                      />
                                    </div>
                                  </div>
                                )}

                                {action.type === "execute_webhook" && (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-4 gap-2">
                                      <div className="col-span-1">
                                        <Label>Method</Label>
                                        <Select
                                          value={action.config.method || "POST"}
                                          onValueChange={(v) => handleUpdateAction(action.id, { config: { ...action.config, method: v } })}
                                        >
                                          <SelectTrigger><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => (
                                              <SelectItem key={m} value={m}>{m}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="col-span-3">
                                        <Label>URL</Label>
                                        <Input
                                          value={action.config.url || ""}
                                          onChange={(e) => handleUpdateAction(action.id, { config: { ...action.config, url: e.target.value } })}
                                          placeholder="https://api.example.com/webhook"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Payload (JSON)</Label>
                                      <Textarea
                                        value={typeof action.config.payload === 'object' ? JSON.stringify(action.config.payload, null, 2) : action.config.payload || "{}"}
                                        onChange={(e) => {
                                          try {
                                            const parsed = JSON.parse(e.target.value);
                                            handleUpdateAction(action.id, { config: { ...action.config, payload: parsed } });
                                          } catch {
                                            handleUpdateAction(action.id, { config: { ...action.config, payload: e.target.value } });
                                          }
                                        }}
                                        placeholder='{"key": "value"}'
                                        rows={4}
                                        className="font-mono text-sm"
                                      />
                                    </div>
                                  </div>
                                )}

                                {action.type === "trigger_automation" && (
                                  <TriggerAutomationActionConfig
                                    config={action.config}
                                    onConfigChange={(newConfig) => handleUpdateAction(action.id, { config: newConfig })}
                                  />
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  )}

                  {/* Add Action Buttons */}
                  <div className="pt-4 border-t">
                    <Label className="text-sm text-muted-foreground mb-2 block">Add Action</Label>
                    <div className="flex flex-wrap gap-2">
                      {ACTION_TYPES.map(actionType => (
                        <Button
                          key={actionType.value}
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddAction(actionType.value)}
                          className="gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          {actionType.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Advanced Options */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span>Advanced Options</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Rule Active</Label>
                      <p className="text-xs text-muted-foreground">Enable or disable this rule</p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                  <div className="space-y-2">
                    <Label>Execution Limit</Label>
                    <Select value={executionLimit} onValueChange={setExecutionLimit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXECUTION_LIMIT_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/50">
          <Button variant="outline" onClick={handleTestRule}>
            <Play className="h-4 w-4 mr-2" />
            Test Rule
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!ruleName || triggerConditions.length === 0}
            >
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
