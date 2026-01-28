-- Automation Rules Table (Main automation rules storage)
CREATE TABLE public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('leads', 'tasks', 'customers', 'professionals', 'quotations')),
  rule_name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('field_change', 'time_based', 'count_based', 'saved_filter')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_limit TEXT DEFAULT 'unlimited' CHECK (execution_limit IN ('once_per_record', 'once_daily', 'unlimited', 'max_limit')),
  max_executions INTEGER,
  active_days TEXT[] DEFAULT ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  active_time_start TIME,
  active_time_end TIME,
  execution_order INTEGER DEFAULT 0,
  exclude_conditions JSONB,
  created_by TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_triggered TIMESTAMP WITH TIME ZONE
);

-- Automation Execution Log Table
CREATE TABLE public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  trigger_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('success', 'failed', 'partial_success', 'in_progress')),
  actions_attempted INTEGER DEFAULT 0,
  actions_succeeded INTEGER DEFAULT 0,
  actions_failed INTEGER DEFAULT 0,
  execution_duration_ms INTEGER,
  execution_log JSONB DEFAULT '[]',
  error_details TEXT,
  created_by TEXT NOT NULL DEFAULT 'System'
);

-- Saved Filter Monitoring Table (for monitoring saved filter counts)
CREATE TABLE public.saved_filter_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id UUID NOT NULL REFERENCES public.saved_filters(id) ON DELETE CASCADE,
  current_count INTEGER DEFAULT 0,
  previous_count INTEGER DEFAULT 0,
  last_checked TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_count_change TIMESTAMP WITH TIME ZONE,
  count_trend TEXT DEFAULT 'stable' CHECK (count_trend IN ('increasing', 'decreasing', 'stable')),
  has_active_triggers BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Rule Execution Tracking (for once_per_record execution limit)
CREATE TABLE public.automation_rule_executions_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  last_executed TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  execution_count INTEGER DEFAULT 1,
  UNIQUE(rule_id, entity_id)
);

-- Notifications Table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'automation')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  entity_type TEXT,
  entity_id UUID,
  related_automation_rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Automation Templates Table
CREATE TABLE public.automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Automation Settings Table (for Control Panel)
CREATE TABLE public.automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filter_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rule_executions_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for automation_rules (managers and admins only)
CREATE POLICY "Allow authenticated users to view automation rules" ON public.automation_rules FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to create automation rules" ON public.automation_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update automation rules" ON public.automation_rules FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated users to delete automation rules" ON public.automation_rules FOR DELETE USING (true);

-- RLS Policies for automation_executions
CREATE POLICY "Allow authenticated users to view automation executions" ON public.automation_executions FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to create automation executions" ON public.automation_executions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update automation executions" ON public.automation_executions FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated users to delete automation executions" ON public.automation_executions FOR DELETE USING (true);

-- RLS Policies for saved_filter_monitoring
CREATE POLICY "Allow authenticated users to view filter monitoring" ON public.saved_filter_monitoring FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to create filter monitoring" ON public.saved_filter_monitoring FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update filter monitoring" ON public.saved_filter_monitoring FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated users to delete filter monitoring" ON public.saved_filter_monitoring FOR DELETE USING (true);

-- RLS Policies for automation_rule_executions_tracking
CREATE POLICY "Allow all access to rule tracking" ON public.automation_rule_executions_tracking FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for notifications
CREATE POLICY "Allow authenticated users to view notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to create notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update notifications" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated users to delete notifications" ON public.notifications FOR DELETE USING (true);

-- RLS Policies for automation_templates
CREATE POLICY "Allow all to view automation templates" ON public.automation_templates FOR SELECT USING (true);
CREATE POLICY "Allow admins to manage automation templates" ON public.automation_templates FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for automation_settings
CREATE POLICY "Allow all to view automation settings" ON public.automation_settings FOR SELECT USING (true);
CREATE POLICY "Allow admins to manage automation settings" ON public.automation_settings FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_automation_rules_entity_type ON public.automation_rules(entity_type);
CREATE INDEX idx_automation_rules_is_active ON public.automation_rules(is_active);
CREATE INDEX idx_automation_rules_trigger_type ON public.automation_rules(trigger_type);
CREATE INDEX idx_automation_executions_rule_id ON public.automation_executions(rule_id);
CREATE INDEX idx_automation_executions_status ON public.automation_executions(status);
CREATE INDEX idx_automation_executions_trigger_timestamp ON public.automation_executions(trigger_timestamp);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX idx_saved_filter_monitoring_filter_id ON public.saved_filter_monitoring(filter_id);

-- Trigger for updated_at on automation_rules
CREATE TRIGGER update_automation_rules_updated_at
BEFORE UPDATE ON public.automation_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on saved_filter_monitoring
CREATE TRIGGER update_saved_filter_monitoring_updated_at
BEFORE UPDATE ON public.saved_filter_monitoring
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on automation_settings
CREATE TRIGGER update_automation_settings_updated_at
BEFORE UPDATE ON public.automation_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default automation settings
INSERT INTO public.automation_settings (setting_key, setting_value) VALUES
  ('global_enabled', '{"enabled": true}'::jsonb),
  ('max_rules_per_entity', '{"value": 50}'::jsonb),
  ('default_check_frequency', '{"minutes": 15}'::jsonb),
  ('log_retention_days', '{"days": 30}'::jsonb),
  ('max_actions_per_rule', '{"value": 10}'::jsonb),
  ('action_timeout_seconds', '{"value": 30}'::jsonb),
  ('enable_webhook_actions', '{"enabled": true}'::jsonb),
  ('webhook_timeout_seconds', '{"value": 10}'::jsonb),
  ('enable_chained_automations', '{"enabled": true}'::jsonb),
  ('max_chain_depth', '{"value": 5}'::jsonb),
  ('quiet_hours', '{"enabled": false, "start": "22:00", "end": "08:00"}'::jsonb),
  ('rate_limiting', '{"enabled": true, "max_per_hour": 100}'::jsonb);

-- Insert pre-built automation templates
INSERT INTO public.automation_templates (template_name, description, entity_type, trigger_type, trigger_config, actions) VALUES
  (
    'New Lead Follow-up',
    'Create a follow-up task when a new lead is added',
    'leads',
    'field_change',
    '{"when": "record_created"}'::jsonb,
    '[{"type": "create_record", "record_type": "task", "config": {"title": "Initial contact with {{trigger.name}}", "type": "Follow-up Call", "priority": "High", "assigned_to_variable": "trigger.assigned_to", "due_date_relative": "+24 hours"}}]'::jsonb
  ),
  (
    'Overdue Task Escalation',
    'Escalate tasks that have been pending for 3 days',
    'tasks',
    'time_based',
    '{"timing_type": "relative_to_field", "field": "due_date", "offset_value": 3, "offset_unit": "days", "offset_direction": "after", "additional_conditions": [{"field": "status", "operator": "equals", "value": "Pending"}]}'::jsonb,
    '[{"type": "update_field", "config": {"field": "priority", "value": "High"}}, {"type": "send_notification", "config": {"recipients": ["manager"], "title": "Task Overdue Alert", "message": "Task \"{{trigger.title}}\" has been pending for 3 days"}}]'::jsonb
  ),
  (
    'Lost Lead Recovery',
    'Create follow-up when lead is marked as lost',
    'leads',
    'field_change',
    '{"when": "field_changes_to", "field": "status", "value": "lost"}'::jsonb,
    '[{"type": "create_record", "record_type": "task", "config": {"title": "Follow-up call to understand why lost - {{trigger.name}}", "type": "Follow-up Call", "priority": "Medium", "assigned_to_variable": "trigger.assigned_to", "due_date_relative": "+7 days"}}]'::jsonb
  ),
  (
    'VIP Customer Alert',
    'Alert when customer total spent exceeds threshold',
    'customers',
    'field_change',
    '{"when": "field_changes", "field": "total_spent", "operator": "greater_than", "value": 500000}'::jsonb,
    '[{"type": "update_field", "config": {"field": "priority", "value": 1}}, {"type": "send_notification", "config": {"recipients": ["all_managers"], "title": "VIP Customer Alert", "message": "Customer {{trigger.name}} has spent over ₹5,00,000"}}]'::jsonb
  ),
  (
    'Quotation Expiry Warning',
    'Send reminder before quotation expires',
    'quotations',
    'time_based',
    '{"timing_type": "relative_to_field", "field": "valid_until", "offset_value": 3, "offset_unit": "days", "offset_direction": "before", "additional_conditions": [{"field": "status", "operator": "equals", "value": "sent"}]}'::jsonb,
    '[{"type": "send_notification", "config": {"recipients": ["trigger.assigned_to"], "title": "Quotation Expiring Soon", "message": "Quotation {{trigger.quotation_number}} expires in 3 days"}}, {"type": "create_record", "record_type": "task", "config": {"title": "Follow up on quotation {{trigger.quotation_number}}", "type": "Follow-up Call", "priority": "High", "due_date_relative": "+1 day"}}]'::jsonb
  ),
  (
    'Hot Leads Surge Alert',
    'Alert team when hot leads count exceeds threshold',
    'leads',
    'saved_filter',
    '{"saved_filter_id": null, "condition": "count_above", "threshold": 20}'::jsonb,
    '[{"type": "send_notification", "config": {"recipients": ["all_sales_team"], "title": "Hot Leads Alert", "message": "{{filter.count}} hot leads require immediate attention", "priority": "urgent"}}]'::jsonb
  );

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;