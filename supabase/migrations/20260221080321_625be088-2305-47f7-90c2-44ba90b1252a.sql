
-- Create helper function that resolves assigned_to (name OR email) to current user
CREATE OR REPLACE FUNCTION public.is_assigned_to_me(assigned_to_value text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (full_name = assigned_to_value OR email = assigned_to_value)
  );
$$;

-- ==================== LEADS ====================
DROP POLICY IF EXISTS "Users can view assigned or created leads" ON public.leads;
CREATE POLICY "Users can view assigned or created leads" ON public.leads
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can update assigned or created leads" ON public.leads;
CREATE POLICY "Users can update assigned or created leads" ON public.leads
  FOR UPDATE USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert leads" ON public.leads;
CREATE POLICY "Users can insert leads" ON public.leads
  FOR INSERT WITH CHECK (
    is_admin() OR is_assigned_to_me(created_by)
  );

-- ==================== TASKS ====================
DROP POLICY IF EXISTS "Users can view assigned or created tasks" ON public.tasks;
CREATE POLICY "Users can view assigned or created tasks" ON public.tasks
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can update assigned or created tasks" ON public.tasks;
CREATE POLICY "Users can update assigned or created tasks" ON public.tasks
  FOR UPDATE USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert tasks" ON public.tasks;
CREATE POLICY "Users can insert tasks" ON public.tasks
  FOR INSERT WITH CHECK (
    is_admin() OR is_assigned_to_me(created_by)
  );

DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.tasks;
CREATE POLICY "Users can delete their own tasks" ON public.tasks
  FOR DELETE USING (
    is_assigned_to_me(created_by) OR is_admin()
  );

-- ==================== CUSTOMERS ====================
DROP POLICY IF EXISTS "Users can view assigned customers" ON public.customers;
CREATE POLICY "Users can view assigned customers" ON public.customers
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can update assigned customers" ON public.customers;
CREATE POLICY "Users can update assigned customers" ON public.customers
  FOR UPDATE USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert customers" ON public.customers;
CREATE POLICY "Users can insert customers" ON public.customers
  FOR INSERT WITH CHECK (
    is_admin() OR is_assigned_to_me(created_by)
  );

-- ==================== PROFESSIONALS ====================
DROP POLICY IF EXISTS "Users can view assigned professionals" ON public.professionals;
CREATE POLICY "Users can view assigned professionals" ON public.professionals
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can update assigned professionals" ON public.professionals;
CREATE POLICY "Users can update assigned professionals" ON public.professionals
  FOR UPDATE USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert professionals" ON public.professionals;
CREATE POLICY "Users can insert professionals" ON public.professionals
  FOR INSERT WITH CHECK (
    is_admin() OR is_assigned_to_me(created_by)
  );

-- ==================== REMINDERS ====================
DROP POLICY IF EXISTS "Users can view assigned reminders" ON public.reminders;
CREATE POLICY "Users can view assigned reminders" ON public.reminders
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can update assigned reminders" ON public.reminders;
CREATE POLICY "Users can update assigned reminders" ON public.reminders
  FOR UPDATE USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert reminders" ON public.reminders;
CREATE POLICY "Users can insert reminders" ON public.reminders
  FOR INSERT WITH CHECK (
    is_admin() OR is_assigned_to_me(created_by)
  );

DROP POLICY IF EXISTS "Users can delete assigned reminders" ON public.reminders;
CREATE POLICY "Users can delete assigned reminders" ON public.reminders
  FOR DELETE USING (
    is_assigned_to_me(created_by) OR is_admin()
  );

-- ==================== QUOTATIONS ====================
DROP POLICY IF EXISTS "Users can view assigned quotations" ON public.quotations;
CREATE POLICY "Users can view assigned quotations" ON public.quotations
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can update assigned quotations" ON public.quotations;
CREATE POLICY "Users can update assigned quotations" ON public.quotations
  FOR UPDATE USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert quotations" ON public.quotations;
CREATE POLICY "Users can insert quotations" ON public.quotations
  FOR INSERT WITH CHECK (
    is_admin() OR is_assigned_to_me(created_by)
  );

-- ==================== TASK_SUBTASKS (uses joined check) ====================
DROP POLICY IF EXISTS "Users can view subtasks via task access" ON public.task_subtasks;
CREATE POLICY "Users can view subtasks via task access" ON public.task_subtasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_subtasks.task_id
      AND (is_assigned_to_me(t.assigned_to) OR is_assigned_to_me(t.created_by) OR is_admin())
    )
  );

DROP POLICY IF EXISTS "Users can insert subtasks" ON public.task_subtasks;
CREATE POLICY "Users can insert subtasks" ON public.task_subtasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_subtasks.task_id
      AND (is_assigned_to_me(t.assigned_to) OR is_assigned_to_me(t.created_by) OR is_admin())
    )
  );

DROP POLICY IF EXISTS "Users can update subtasks via task access" ON public.task_subtasks;
CREATE POLICY "Users can update subtasks via task access" ON public.task_subtasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_subtasks.task_id
      AND (is_assigned_to_me(t.assigned_to) OR is_assigned_to_me(t.created_by) OR is_admin())
    )
  );

DROP POLICY IF EXISTS "Users can delete subtasks via task access" ON public.task_subtasks;
CREATE POLICY "Users can delete subtasks via task access" ON public.task_subtasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_subtasks.task_id
      AND (is_assigned_to_me(t.created_by) OR is_admin())
    )
  );
