import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  AutomationRule, 
  AutomationExecution, 
  AutomationTemplate, 
  EntityType,
  TriggerConfig,
  AutomationAction 
} from "@/types/automation";

// Fetch automation rules
export const useAutomationRules = (entityType?: EntityType) => {
  return useQuery({
    queryKey: ["automation-rules", entityType],
    queryFn: async () => {
      let query = supabase
        .from("automation_rules")
        .select("*")
        .order("execution_order", { ascending: true });
      
      if (entityType) {
        query = query.eq("entity_type", entityType);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(rule => ({
        ...rule,
        trigger_config: rule.trigger_config as unknown as TriggerConfig,
        actions: (rule.actions as unknown as AutomationAction[]) || [],
        exclude_conditions: rule.exclude_conditions as unknown as any,
      })) as AutomationRule[];
    },
  });
};

// Fetch single automation rule
export const useAutomationRule = (ruleId: string | undefined) => {
  return useQuery({
    queryKey: ["automation-rule", ruleId],
    queryFn: async () => {
      if (!ruleId) return null;
      
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("id", ruleId)
        .single();
      
      if (error) throw error;
      
      return {
        ...data,
        trigger_config: data.trigger_config as unknown as TriggerConfig,
        actions: (data.actions as unknown as AutomationAction[]) || [],
        exclude_conditions: data.exclude_conditions as unknown as any,
      } as AutomationRule;
    },
    enabled: !!ruleId,
  });
};

// Create automation rule
export const useCreateAutomationRule = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rule: Omit<AutomationRule, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("automation_rules")
        .insert({
          entity_type: rule.entity_type,
          rule_name: rule.rule_name,
          description: rule.description,
          trigger_type: rule.trigger_type,
          trigger_config: rule.trigger_config as any,
          actions: rule.actions as any,
          is_active: rule.is_active,
          execution_limit: rule.execution_limit,
          max_executions: rule.max_executions,
          active_days: rule.active_days,
          active_time_start: rule.active_time_start,
          active_time_end: rule.active_time_end,
          execution_order: rule.execution_order,
          exclude_conditions: rule.exclude_conditions as any,
          created_by: rule.created_by,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({
        title: "Rule Created",
        description: "Automation rule has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Update automation rule
export const useUpdateAutomationRule = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationRule> & { id: string }) => {
      const { data, error } = await supabase
        .from("automation_rules")
        .update({
          ...updates,
          trigger_config: updates.trigger_config as any,
          actions: updates.actions as any,
          exclude_conditions: updates.exclude_conditions as any,
        })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({
        title: "Rule Updated",
        description: "Automation rule has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Delete automation rule
export const useDeleteAutomationRule = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from("automation_rules")
        .delete()
        .eq("id", ruleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({
        title: "Rule Deleted",
        description: "Automation rule has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Toggle automation rule active status
export const useToggleAutomationRule = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from("automation_rules")
        .update({ is_active })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({
        title: data.is_active ? "Rule Enabled" : "Rule Disabled",
        description: `Automation rule "${data.rule_name}" has been ${data.is_active ? "enabled" : "disabled"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Duplicate automation rule
export const useDuplicateAutomationRule = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ruleId: string) => {
      // First fetch the original rule
      const { data: originalRule, error: fetchError } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("id", ruleId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Create a duplicate with modified name
      const { data, error } = await supabase
        .from("automation_rules")
        .insert({
          entity_type: originalRule.entity_type,
          rule_name: `${originalRule.rule_name} (Copy)`,
          description: originalRule.description,
          trigger_type: originalRule.trigger_type,
          trigger_config: originalRule.trigger_config,
          actions: originalRule.actions,
          is_active: false, // Start disabled
          execution_limit: originalRule.execution_limit,
          max_executions: originalRule.max_executions,
          active_days: originalRule.active_days,
          active_time_start: originalRule.active_time_start,
          active_time_end: originalRule.active_time_end,
          execution_order: originalRule.execution_order + 1,
          exclude_conditions: originalRule.exclude_conditions,
          created_by: originalRule.created_by,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({
        title: "Rule Duplicated",
        description: "Automation rule has been duplicated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Reorder automation rules
export const useReorderAutomationRules = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rules: { id: string; execution_order: number }[]) => {
      const updates = rules.map(rule => 
        supabase
          .from("automation_rules")
          .update({ execution_order: rule.execution_order })
          .eq("id", rule.id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Fetch automation executions
export const useAutomationExecutions = (ruleId?: string, limit = 50) => {
  return useQuery({
    queryKey: ["automation-executions", ruleId, limit],
    queryFn: async () => {
      let query = supabase
        .from("automation_executions")
        .select("*, automation_rules(rule_name)")
        .order("trigger_timestamp", { ascending: false })
        .limit(limit);
      
      if (ruleId) {
        query = query.eq("rule_id", ruleId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(exec => ({
        ...exec,
        execution_log: (exec.execution_log as unknown as any[]) || [],
      })) as (AutomationExecution & { automation_rules: { rule_name: string } })[];
    },
  });
};

// Fetch automation templates
export const useAutomationTemplates = (entityType?: EntityType) => {
  return useQuery({
    queryKey: ["automation-templates", entityType],
    queryFn: async () => {
      let query = supabase
        .from("automation_templates")
        .select("*")
        .order("template_name", { ascending: true });
      
      if (entityType) {
        query = query.eq("entity_type", entityType);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(template => ({
        ...template,
        trigger_config: template.trigger_config as unknown as TriggerConfig,
        actions: (template.actions as unknown as AutomationAction[]) || [],
      })) as AutomationTemplate[];
    },
  });
};

// Create rule from template
export const useCreateFromTemplate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Fetch template
      const { data: template, error: fetchError } = await supabase
        .from("automation_templates")
        .select("*")
        .eq("id", templateId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Create rule from template
      const { data, error } = await supabase
        .from("automation_rules")
        .insert({
          entity_type: template.entity_type,
          rule_name: template.template_name,
          description: template.description,
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config,
          actions: template.actions,
          is_active: false, // Start disabled
          created_by: "System",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({
        title: "Rule Created from Template",
        description: "You can now customize the rule before enabling it.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
