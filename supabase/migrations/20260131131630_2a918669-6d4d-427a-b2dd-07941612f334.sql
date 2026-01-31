-- Security hardening: fix permissive RLS (WITH CHECK true / USING true for write operations)

-- 1) automation_settings: restrict ALL to admins (was USING(true)/WITH CHECK(true))
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='automation_settings'
      AND policyname='Allow admins to manage automation settings'
  ) THEN
    EXECUTE 'DROP POLICY "Allow admins to manage automation settings" ON public.automation_settings';
  END IF;
END $$;

CREATE POLICY "Allow admins to manage automation settings"
ON public.automation_settings
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2) automation_templates: restrict ALL to admins (was USING(true)/WITH CHECK(true))
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='automation_templates'
      AND policyname='Allow admins to manage automation templates'
  ) THEN
    EXECUTE 'DROP POLICY "Allow admins to manage automation templates" ON public.automation_templates';
  END IF;
END $$;

CREATE POLICY "Allow admins to manage automation templates"
ON public.automation_templates
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 3) activity_log: prevent spoofed inserts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='activity_log'
      AND policyname='Users can insert activity logs'
  ) THEN
    EXECUTE 'DROP POLICY "Users can insert activity logs" ON public.activity_log';
  END IF;
END $$;

CREATE POLICY "Users can insert activity logs"
ON public.activity_log
FOR INSERT
WITH CHECK (
  public.is_admin()
  OR user_name = public.get_current_user_email()
  OR user_id = auth.uid()::text
);

-- 4) Tighten INSERT policies on core CRM tables to require created_by = current user (or admin)
-- Also set sensible defaults so inserts don't need to pass created_by manually.

-- leads
ALTER TABLE public.leads ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='Users can insert leads') THEN
    EXECUTE 'DROP POLICY "Users can insert leads" ON public.leads';
  END IF;
END $$;
CREATE POLICY "Users can insert leads"
ON public.leads
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- customers
ALTER TABLE public.customers ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='Users can insert customers') THEN
    EXECUTE 'DROP POLICY "Users can insert customers" ON public.customers';
  END IF;
END $$;
CREATE POLICY "Users can insert customers"
ON public.customers
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- professionals
ALTER TABLE public.professionals ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='professionals' AND policyname='Users can insert professionals') THEN
    EXECUTE 'DROP POLICY "Users can insert professionals" ON public.professionals';
  END IF;
END $$;
CREATE POLICY "Users can insert professionals"
ON public.professionals
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- tasks
ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tasks' AND policyname='Users can insert tasks') THEN
    EXECUTE 'DROP POLICY "Users can insert tasks" ON public.tasks';
  END IF;
END $$;
CREATE POLICY "Users can insert tasks"
ON public.tasks
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- reminders
ALTER TABLE public.reminders ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reminders' AND policyname='Users can insert reminders') THEN
    EXECUTE 'DROP POLICY "Users can insert reminders" ON public.reminders';
  END IF;
END $$;
CREATE POLICY "Users can insert reminders"
ON public.reminders
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- notifications (system is allowed via service role; for client inserts require user_id match)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can insert notifications') THEN
    EXECUTE 'DROP POLICY "Users can insert notifications" ON public.notifications';
  END IF;
END $$;
CREATE POLICY "Users can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  public.is_admin()
  OR user_id = public.get_current_user_email()
);

-- 5) Related tables: ensure INSERT requires parent access (not true)

-- task_subtasks: must have access to parent task
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_subtasks' AND policyname='Users can insert subtasks') THEN
    EXECUTE 'DROP POLICY "Users can insert subtasks" ON public.task_subtasks';
  END IF;
END $$;
CREATE POLICY "Users can insert subtasks"
ON public.task_subtasks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_subtasks.task_id
      AND (
        t.assigned_to = public.get_current_user_email()
        OR t.created_by = public.get_current_user_email()
        OR public.is_admin()
      )
  )
);

-- task_snooze_history: must have access to parent task, and created_by must be current user (or admin)
ALTER TABLE public.task_snooze_history ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_snooze_history' AND policyname='Users can insert snooze history') THEN
    EXECUTE 'DROP POLICY "Users can insert snooze history" ON public.task_snooze_history';
  END IF;
END $$;
CREATE POLICY "Users can insert snooze history"
ON public.task_snooze_history
FOR INSERT
WITH CHECK (
  (public.is_admin() OR created_by = public.get_current_user_email())
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_snooze_history.task_id
      AND (
        t.assigned_to = public.get_current_user_email()
        OR t.created_by = public.get_current_user_email()
        OR public.is_admin()
      )
  )
);

-- quotation_items: must have access to quotation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotation_items' AND policyname='Users can insert quotation items') THEN
    EXECUTE 'DROP POLICY "Users can insert quotation items" ON public.quotation_items';
  END IF;
END $$;
CREATE POLICY "Users can insert quotation items"
ON public.quotation_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quotations q
    WHERE q.id = quotation_items.quotation_id
      AND (
        q.assigned_to = public.get_current_user_email()
        OR q.created_by = public.get_current_user_email()
        OR public.is_admin()
      )
  )
);

-- quotation_attachments: must have access to quotation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotation_attachments' AND policyname='Users can insert quotation attachments') THEN
    EXECUTE 'DROP POLICY "Users can insert quotation attachments" ON public.quotation_attachments';
  END IF;
END $$;
CREATE POLICY "Users can insert quotation attachments"
ON public.quotation_attachments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quotations q
    WHERE q.id = quotation_attachments.quotation_id
      AND (
        q.assigned_to = public.get_current_user_email()
        OR q.created_by = public.get_current_user_email()
        OR public.is_admin()
      )
  )
);

-- quotations: require created_by = current user (or admin)
ALTER TABLE public.quotations ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotations' AND policyname='Users can insert quotations') THEN
    EXECUTE 'DROP POLICY "Users can insert quotations" ON public.quotations';
  END IF;
END $$;
CREATE POLICY "Users can insert quotations"
ON public.quotations
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- saved_filters: require created_by = current user (or admin)
ALTER TABLE public.saved_filters ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters' AND policyname='Users can insert filters') THEN
    EXECUTE 'DROP POLICY "Users can insert filters" ON public.saved_filters';
  END IF;
END $$;
CREATE POLICY "Users can insert filters"
ON public.saved_filters
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- todo_lists: require created_by = current user (or admin)
ALTER TABLE public.todo_lists ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='todo_lists' AND policyname='Users can insert todo lists') THEN
    EXECUTE 'DROP POLICY "Users can insert todo lists" ON public.todo_lists';
  END IF;
END $$;
CREATE POLICY "Users can insert todo lists"
ON public.todo_lists
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- todo_items: require created_by = current user (or admin)
ALTER TABLE public.todo_items ALTER COLUMN created_by SET DEFAULT public.get_current_user_email();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='todo_items' AND policyname='Users can insert todo items') THEN
    EXECUTE 'DROP POLICY "Users can insert todo items" ON public.todo_items';
  END IF;
END $$;
CREATE POLICY "Users can insert todo items"
ON public.todo_items
FOR INSERT
WITH CHECK (public.is_admin() OR created_by = public.get_current_user_email());

-- 6) System insert-only tables: restrict client inserts to admins (runner/service role bypasses RLS anyway)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='automation_executions' AND policyname='System can insert automation executions') THEN
    EXECUTE 'DROP POLICY "System can insert automation executions" ON public.automation_executions';
  END IF;
END $$;
CREATE POLICY "System can insert automation executions"
ON public.automation_executions
FOR INSERT
WITH CHECK (public.is_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='automation_rule_executions_tracking' AND policyname='System can insert rule tracking') THEN
    EXECUTE 'DROP POLICY "System can insert rule tracking" ON public.automation_rule_executions_tracking';
  END IF;
END $$;
CREATE POLICY "System can insert rule tracking"
ON public.automation_rule_executions_tracking
FOR INSERT
WITH CHECK (public.is_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filter_monitoring' AND policyname='System can insert filter monitoring') THEN
    EXECUTE 'DROP POLICY "System can insert filter monitoring" ON public.saved_filter_monitoring';
  END IF;
END $$;
CREATE POLICY "System can insert filter monitoring"
ON public.saved_filter_monitoring
FOR INSERT
WITH CHECK (public.is_admin());
