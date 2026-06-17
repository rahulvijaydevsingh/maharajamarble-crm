-- Phase 1: Task Completion + Templates + Task Activity Log foundations (retry)

-- 1) Extend public.tasks with completion + attempts + deal flag fields
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completion_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS completion_outcome TEXT NULL,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS completion_key_points JSONB NULL,
  ADD COLUMN IF NOT EXISTS actual_time_spent_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS next_action_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS next_action_payload JSONB NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NULL,
  ADD COLUMN IF NOT EXISTS deal_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deal_ready_at TIMESTAMPTZ NULL;

-- Helpful indexes for leakage checks / reporting
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id);

-- 2) Dedicated Quick Templates table
CREATE TABLE IF NOT EXISTS public.task_completion_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- matches tasks.type (e.g., Call / Site Visit / Meeting / Delivery)
  task_type TEXT NOT NULL,
  name TEXT NOT NULL,

  -- template may include placeholders like [product/service]
  template_notes TEXT NOT NULL,

  -- optional defaults applied when selecting this template
  default_completion_status TEXT NULL,
  default_outcome TEXT NULL,
  default_next_action_type TEXT NULL,
  default_next_action_payload JSONB NULL
);

ALTER TABLE public.task_completion_templates ENABLE ROW LEVEL SECURITY;

-- Policies (DROP then CREATE to be idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_completion_templates'
      AND policyname='Admins can manage task completion templates'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage task completion templates" ON public.task_completion_templates';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_completion_templates'
      AND policyname='Authenticated users can view active task completion templates'
  ) THEN
    EXECUTE 'DROP POLICY "Authenticated users can view active task completion templates" ON public.task_completion_templates';
  END IF;
END $$;

CREATE POLICY "Admins can manage task completion templates"
ON public.task_completion_templates
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view active task completion templates"
ON public.task_completion_templates
FOR SELECT
USING (is_active = true);

-- 3) Task Activity Log (detailed timeline, supports standalone tasks)
CREATE TABLE IF NOT EXISTS public.task_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,

  user_id UUID NULL,
  user_name TEXT NOT NULL DEFAULT 'System',

  -- structured details: before/after, attempt counts, outcomes, next action, etc.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- optional note associated with the event (e.g., completion note, reschedule reason)
  notes TEXT NULL
);

ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_activity_log'
      AND policyname='Users can view task activity via task access'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view task activity via task access" ON public.task_activity_log';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_activity_log'
      AND policyname='Users can insert task activity via task access'
  ) THEN
    EXECUTE 'DROP POLICY "Users can insert task activity via task access" ON public.task_activity_log';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_activity_log'
      AND policyname='Admins can update task activity logs'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can update task activity logs" ON public.task_activity_log';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_activity_log'
      AND policyname='Admins can delete task activity logs'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can delete task activity logs" ON public.task_activity_log';
  END IF;
END $$;

CREATE POLICY "Users can view task activity via task access"
ON public.task_activity_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_activity_log.task_id
      AND (
        t.assigned_to = public.get_current_user_email()
        OR t.created_by = public.get_current_user_email()
        OR public.is_admin()
      )
  )
);

CREATE POLICY "Users can insert task activity via task access"
ON public.task_activity_log
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_activity_log.task_id
      AND (
        t.assigned_to = public.get_current_user_email()
        OR t.created_by = public.get_current_user_email()
        OR public.is_admin()
      )
  )
);

CREATE POLICY "Admins can update task activity logs"
ON public.task_activity_log
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete task activity logs"
ON public.task_activity_log
FOR DELETE
USING (public.is_admin());

-- 4) entity_attachments: extend access to support entity_type='task'
DO $$
BEGIN
  -- SELECT
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='entity_attachments'
      AND policyname='Users can view attachments for accessible entities'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view attachments for accessible entities" ON public.entity_attachments';
  END IF;

  -- INSERT
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='entity_attachments'
      AND policyname='Users can add attachments for accessible entities'
  ) THEN
    EXECUTE 'DROP POLICY "Users can add attachments for accessible entities" ON public.entity_attachments';
  END IF;

  -- DELETE
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='entity_attachments'
      AND policyname='Users can delete attachments for accessible entities'
  ) THEN
    EXECUTE 'DROP POLICY "Users can delete attachments for accessible entities" ON public.entity_attachments';
  END IF;
END $$;

CREATE POLICY "Users can view attachments for accessible entities"
ON public.entity_attachments
FOR SELECT
USING (
  public.is_admin()
  OR (
    entity_type = 'lead'
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = entity_attachments.entity_id
        AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = entity_attachments.entity_id
        AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = entity_attachments.entity_id
        AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email() OR public.is_admin())
    )
  )
);

CREATE POLICY "Users can add attachments for accessible entities"
ON public.entity_attachments
FOR INSERT
WITH CHECK (
  public.is_admin()
  OR (
    entity_type = 'lead'
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = entity_attachments.entity_id
        AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = entity_attachments.entity_id
        AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = entity_attachments.entity_id
        AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email() OR public.is_admin())
    )
  )
);

CREATE POLICY "Users can delete attachments for accessible entities"
ON public.entity_attachments
FOR DELETE
USING (
  public.is_admin()
  OR (
    entity_type = 'lead'
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = entity_attachments.entity_id
        AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = entity_attachments.entity_id
        AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = entity_attachments.entity_id
        AND (t.created_by = public.get_current_user_email() OR public.is_admin())
    )
  )
);

-- 5) updated_at trigger for templates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_task_completion_templates_updated_at') THEN
    CREATE TRIGGER update_task_completion_templates_updated_at
    BEFORE UPDATE ON public.task_completion_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
