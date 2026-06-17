-- Fix RLS policies for all core business tables
-- This migration replaces overly permissive USING (true) policies with proper role/assignment-based policies

-- Helper function to get current user's email from JWT
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'email',
    (SELECT email FROM auth.users WHERE id = auth.uid())
  );
$$;

-- Update get_user_role to only allow viewing own role or if admin
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = _user_id 
    AND (_user_id = auth.uid() OR public.is_admin())
  LIMIT 1
$$;

-- Update has_role to restrict access (only self or admin)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
      AND role = _role
      AND (_user_id = auth.uid() OR public.is_admin())
  )
$$;

-- ============== LEADS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to leads" ON public.leads;

CREATE POLICY "Users can view assigned or created leads"
ON public.leads FOR SELECT
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert leads"
ON public.leads FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update assigned or created leads"
ON public.leads FOR UPDATE
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Admins can delete leads"
ON public.leads FOR DELETE
USING (is_admin());

-- ============== CUSTOMERS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to customers" ON public.customers;

CREATE POLICY "Users can view assigned customers"
ON public.customers FOR SELECT
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert customers"
ON public.customers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update assigned customers"
ON public.customers FOR UPDATE
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Admins can delete customers"
ON public.customers FOR DELETE
USING (is_admin());

-- ============== TASKS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to tasks" ON public.tasks;

CREATE POLICY "Users can view assigned or created tasks"
ON public.tasks FOR SELECT
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert tasks"
ON public.tasks FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update assigned or created tasks"
ON public.tasks FOR UPDATE
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can delete their own tasks"
ON public.tasks FOR DELETE
USING (
  created_by = get_current_user_email()
  OR is_admin()
);

-- ============== PROFESSIONALS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to professionals" ON public.professionals;

CREATE POLICY "Users can view assigned professionals"
ON public.professionals FOR SELECT
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert professionals"
ON public.professionals FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update assigned professionals"
ON public.professionals FOR UPDATE
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Admins can delete professionals"
ON public.professionals FOR DELETE
USING (is_admin());

-- ============== QUOTATIONS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to quotations" ON public.quotations;

CREATE POLICY "Users can view assigned quotations"
ON public.quotations FOR SELECT
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert quotations"
ON public.quotations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update assigned quotations"
ON public.quotations FOR UPDATE
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Admins can delete quotations"
ON public.quotations FOR DELETE
USING (is_admin());

-- ============== QUOTATION_ITEMS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to quotation_items" ON public.quotation_items;

CREATE POLICY "Users can view quotation items via quotation access"
ON public.quotation_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.assigned_to = get_current_user_email()
           OR q.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can insert quotation items"
ON public.quotation_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update quotation items via quotation access"
ON public.quotation_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.assigned_to = get_current_user_email()
           OR q.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can delete quotation items via quotation access"
ON public.quotation_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.assigned_to = get_current_user_email()
           OR q.created_by = get_current_user_email()
           OR is_admin())
  )
);

-- ============== QUOTATION_ATTACHMENTS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to quotation_attachments" ON public.quotation_attachments;

CREATE POLICY "Users can view quotation attachments via quotation access"
ON public.quotation_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.assigned_to = get_current_user_email()
           OR q.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can insert quotation attachments"
ON public.quotation_attachments FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update quotation attachments via quotation access"
ON public.quotation_attachments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.assigned_to = get_current_user_email()
           OR q.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can delete quotation attachments via quotation access"
ON public.quotation_attachments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.assigned_to = get_current_user_email()
           OR q.created_by = get_current_user_email()
           OR is_admin())
  )
);

-- ============== TODO_LISTS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to todo_lists" ON public.todo_lists;

CREATE POLICY "Users can view own todo lists"
ON public.todo_lists FOR SELECT
USING (
  created_by = get_current_user_email()
  OR is_shared = true
  OR get_current_user_email() = ANY(shared_with)
  OR is_admin()
);

CREATE POLICY "Users can insert todo lists"
ON public.todo_lists FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own todo lists"
ON public.todo_lists FOR UPDATE
USING (
  created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can delete own todo lists"
ON public.todo_lists FOR DELETE
USING (
  created_by = get_current_user_email()
  OR is_admin()
);

-- ============== TODO_ITEMS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to todo_items" ON public.todo_items;

CREATE POLICY "Users can view todo items via list access"
ON public.todo_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.todo_lists tl
    WHERE tl.id = list_id
      AND (tl.created_by = get_current_user_email()
           OR tl.is_shared = true
           OR get_current_user_email() = ANY(tl.shared_with)
           OR is_admin())
  )
);

CREATE POLICY "Users can insert todo items"
ON public.todo_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update todo items via list access"
ON public.todo_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.todo_lists tl
    WHERE tl.id = list_id
      AND (tl.created_by = get_current_user_email()
           OR tl.is_shared = true
           OR get_current_user_email() = ANY(tl.shared_with)
           OR is_admin())
  )
);

CREATE POLICY "Users can delete todo items via list access"
ON public.todo_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.todo_lists tl
    WHERE tl.id = list_id
      AND (tl.created_by = get_current_user_email()
           OR is_admin())
  )
);

-- ============== REMINDERS TABLE ==============
DROP POLICY IF EXISTS "Users can view all reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can create reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete reminders" ON public.reminders;

CREATE POLICY "Users can view assigned reminders"
ON public.reminders FOR SELECT
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert reminders"
ON public.reminders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update assigned reminders"
ON public.reminders FOR UPDATE
USING (
  assigned_to = get_current_user_email()
  OR created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can delete assigned reminders"
ON public.reminders FOR DELETE
USING (
  created_by = get_current_user_email()
  OR is_admin()
);

-- ============== NOTIFICATIONS TABLE ==============
DROP POLICY IF EXISTS "Allow authenticated users to view notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow authenticated users to create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow authenticated users to update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow authenticated users to delete notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (
  user_id = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (
  user_id = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (
  user_id = get_current_user_email()
  OR is_admin()
);

-- ============== ACTIVITY_LOG TABLE ==============
DROP POLICY IF EXISTS "Allow authenticated users to view activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Allow authenticated users to create activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Allow admins to update activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Allow admins to delete activity logs" ON public.activity_log;

CREATE POLICY "Users can view activity logs for accessible entities"
ON public.activity_log FOR SELECT
USING (
  user_name = get_current_user_email()
  OR user_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.leads l 
    WHERE l.id = activity_log.lead_id 
      AND (l.assigned_to = get_current_user_email() OR l.created_by = get_current_user_email())
  )
  OR EXISTS (
    SELECT 1 FROM public.customers c 
    WHERE c.id = activity_log.customer_id 
      AND (c.assigned_to = get_current_user_email() OR c.created_by = get_current_user_email())
  )
  OR is_admin()
);

CREATE POLICY "Users can insert activity logs"
ON public.activity_log FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update activity logs"
ON public.activity_log FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete activity logs"
ON public.activity_log FOR DELETE
USING (is_admin());

-- ============== SAVED_FILTERS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to saved_filters" ON public.saved_filters;

CREATE POLICY "Users can view own or shared filters"
ON public.saved_filters FOR SELECT
USING (
  created_by = get_current_user_email()
  OR is_shared = true
  OR is_admin()
);

CREATE POLICY "Users can insert filters"
ON public.saved_filters FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own filters"
ON public.saved_filters FOR UPDATE
USING (
  created_by = get_current_user_email()
  OR is_admin()
);

CREATE POLICY "Users can delete own filters"
ON public.saved_filters FOR DELETE
USING (
  created_by = get_current_user_email()
  OR is_admin()
);

-- ============== TASK_SUBTASKS TABLE ==============
DROP POLICY IF EXISTS "Allow all access to task_subtasks" ON public.task_subtasks;

CREATE POLICY "Users can view subtasks via task access"
ON public.task_subtasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = get_current_user_email()
           OR t.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can insert subtasks"
ON public.task_subtasks FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update subtasks via task access"
ON public.task_subtasks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = get_current_user_email()
           OR t.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can delete subtasks via task access"
ON public.task_subtasks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.created_by = get_current_user_email()
           OR is_admin())
  )
);

-- ============== TASK_SNOOZE_HISTORY TABLE ==============
DROP POLICY IF EXISTS "Allow all access to task_snooze_history" ON public.task_snooze_history;

CREATE POLICY "Users can view snooze history via task access"
ON public.task_snooze_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = get_current_user_email()
           OR t.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can insert snooze history"
ON public.task_snooze_history FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update snooze history via task access"
ON public.task_snooze_history FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = get_current_user_email()
           OR t.created_by = get_current_user_email()
           OR is_admin())
  )
);

CREATE POLICY "Users can delete snooze history via task access"
ON public.task_snooze_history FOR DELETE
USING (is_admin());

-- ============== AUTOMATION_RULES TABLE ==============
DROP POLICY IF EXISTS "Allow authenticated users to view automation rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Allow authenticated users to create automation rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Allow authenticated users to update automation rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Allow authenticated users to delete automation rules" ON public.automation_rules;

CREATE POLICY "Admins can view automation rules"
ON public.automation_rules FOR SELECT
USING (is_admin());

CREATE POLICY "Admins can insert automation rules"
ON public.automation_rules FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update automation rules"
ON public.automation_rules FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete automation rules"
ON public.automation_rules FOR DELETE
USING (is_admin());

-- ============== AUTOMATION_EXECUTIONS TABLE ==============
DROP POLICY IF EXISTS "Allow authenticated users to view automation executions" ON public.automation_executions;
DROP POLICY IF EXISTS "Allow authenticated users to create automation executions" ON public.automation_executions;
DROP POLICY IF EXISTS "Allow authenticated users to update automation executions" ON public.automation_executions;
DROP POLICY IF EXISTS "Allow authenticated users to delete automation executions" ON public.automation_executions;

CREATE POLICY "Admins can view automation executions"
ON public.automation_executions FOR SELECT
USING (is_admin());

CREATE POLICY "System can insert automation executions"
ON public.automation_executions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update automation executions"
ON public.automation_executions FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete automation executions"
ON public.automation_executions FOR DELETE
USING (is_admin());

-- ============== AUTOMATION_RULE_EXECUTIONS_TRACKING TABLE ==============
DROP POLICY IF EXISTS "Allow all access to rule tracking" ON public.automation_rule_executions_tracking;

CREATE POLICY "Admins can view rule tracking"
ON public.automation_rule_executions_tracking FOR SELECT
USING (is_admin());

CREATE POLICY "System can insert rule tracking"
ON public.automation_rule_executions_tracking FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update rule tracking"
ON public.automation_rule_executions_tracking FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete rule tracking"
ON public.automation_rule_executions_tracking FOR DELETE
USING (is_admin());

-- ============== SAVED_FILTER_MONITORING TABLE ==============
DROP POLICY IF EXISTS "Allow authenticated users to view filter monitoring" ON public.saved_filter_monitoring;
DROP POLICY IF EXISTS "Allow authenticated users to create filter monitoring" ON public.saved_filter_monitoring;
DROP POLICY IF EXISTS "Allow authenticated users to update filter monitoring" ON public.saved_filter_monitoring;
DROP POLICY IF EXISTS "Allow authenticated users to delete filter monitoring" ON public.saved_filter_monitoring;

CREATE POLICY "Admins can view filter monitoring"
ON public.saved_filter_monitoring FOR SELECT
USING (is_admin());

CREATE POLICY "System can insert filter monitoring"
ON public.saved_filter_monitoring FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update filter monitoring"
ON public.saved_filter_monitoring FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete filter monitoring"
ON public.saved_filter_monitoring FOR DELETE
USING (is_admin());