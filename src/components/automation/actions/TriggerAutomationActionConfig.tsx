import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAutomationRules } from "@/hooks/useAutomationRules";
import { Loader2, Zap } from "lucide-react";

interface TriggerAutomationActionConfigProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  currentRuleId?: string;
}

export const TriggerAutomationActionConfig = ({ 
  config, 
  onConfigChange,
  currentRuleId 
}: TriggerAutomationActionConfigProps) => {
  const { data: allRules, isLoading } = useAutomationRules();
  
  // Filter out current rule to prevent self-triggering loops
  const availableRules = (allRules || []).filter(rule => rule.id !== currentRuleId);

  const updateConfig = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  const selectedRule = availableRules.find(r => r.id === config.target_rule_id);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Target Automation Rule *</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Select another automation rule to trigger when this action executes
        </p>
        
        {isLoading ? (
          <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading automation rules...</span>
          </div>
        ) : availableRules.length === 0 ? (
          <div className="p-4 border rounded-lg bg-muted/50 text-center">
            <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No other automation rules available.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Create more rules first to chain them together.
            </p>
          </div>
        ) : (
          <Select
            value={config.target_rule_id || ""}
            onValueChange={(v) => updateConfig("target_rule_id", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an automation rule..." />
            </SelectTrigger>
            <SelectContent>
              {availableRules.map(rule => (
                <SelectItem key={rule.id} value={rule.id}>
                  <div className="flex items-center gap-2">
                    <Zap className="h-3 w-3" />
                    <span>{rule.rule_name}</span>
                    <Badge variant={rule.is_active ? "default" : "secondary"} className="text-[10px]">
                      {rule.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {rule.entity_type}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedRule && (
        <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
          <div className="text-sm font-medium">Selected Rule Details</div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Name:</strong> {selectedRule.rule_name}</p>
            <p><strong>Entity:</strong> {selectedRule.entity_type}</p>
            <p><strong>Trigger:</strong> {selectedRule.trigger_type}</p>
            {selectedRule.description && (
              <p><strong>Description:</strong> {selectedRule.description}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <Label>Pass Variables</Label>
          <p className="text-xs text-muted-foreground">
            Share trigger data with the chained automation
          </p>
        </div>
        <Switch
          checked={config.pass_variables !== false}
          onCheckedChange={(checked) => updateConfig("pass_variables", checked)}
        />
      </div>

      {config.pass_variables !== false && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            The following variables will be available in the chained automation:
          </p>
          <ul className="text-xs text-blue-600 mt-2 space-y-1">
            <li>• <code>{"{{parent.entity_id}}"}</code> - ID of the triggering record</li>
            <li>• <code>{"{{parent.entity_type}}"}</code> - Type of the triggering entity</li>
            <li>• <code>{"{{parent.rule_name}}"}</code> - Name of this automation</li>
            <li>• All trigger record fields via <code>{"{{parent.field_name}}"}</code></li>
          </ul>
        </div>
      )}
    </div>
  );
};
