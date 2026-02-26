
-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Users can delete own todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Users can insert todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Users can update own todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Users can view own todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Users can view shared todo lists" ON public.todo_lists;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Users can view own or shared todo lists"
  ON public.todo_lists FOR SELECT
  USING (created_by = get_current_user_email() OR is_admin() OR get_current_user_email() = ANY(shared_with));

CREATE POLICY "Users can insert todo lists"
  ON public.todo_lists FOR INSERT
  WITH CHECK (created_by = get_current_user_email() OR is_admin());

CREATE POLICY "Users can update own todo lists"
  ON public.todo_lists FOR UPDATE
  USING (created_by = get_current_user_email() OR is_admin());

CREATE POLICY "Users can delete own todo lists"
  ON public.todo_lists FOR DELETE
  USING (created_by = get_current_user_email() OR is_admin());
