
-- Fix kit_subscriptions RLS: replace USING(true) with assignment-based policies
DROP POLICY IF EXISTS "Users can view all subscriptions" ON public.kit_subscriptions;
DROP POLICY IF EXISTS "Users can update subscriptions" ON public.kit_subscriptions;
DROP POLICY IF EXISTS "Users can delete subscriptions" ON public.kit_subscriptions;
DROP POLICY IF EXISTS "Users can create subscriptions" ON public.kit_subscriptions;

CREATE POLICY "Users can view accessible subscriptions"
ON public.kit_subscriptions FOR SELECT TO authenticated
USING (is_assigned_to_me(assigned_to) OR is_assigned_to_me(created_by) OR is_admin());

CREATE POLICY "Users can create subscriptions"
ON public.kit_subscriptions FOR INSERT TO authenticated
WITH CHECK (is_assigned_to_me(assigned_to) OR is_assigned_to_me(created_by) OR is_admin());

CREATE POLICY "Users can update accessible subscriptions"
ON public.kit_subscriptions FOR UPDATE TO authenticated
USING (is_assigned_to_me(assigned_to) OR is_assigned_to_me(created_by) OR is_admin());

CREATE POLICY "Admins can delete subscriptions"
ON public.kit_subscriptions FOR DELETE TO authenticated
USING (is_admin());

-- Fix kit_touches RLS: replace USING(true) with assignment-based policies
DROP POLICY IF EXISTS "Users can view all touches" ON public.kit_touches;
DROP POLICY IF EXISTS "Users can update touches" ON public.kit_touches;
DROP POLICY IF EXISTS "Users can delete touches" ON public.kit_touches;
DROP POLICY IF EXISTS "Users can create touches" ON public.kit_touches;

CREATE POLICY "Users can view accessible touches"
ON public.kit_touches FOR SELECT TO authenticated
USING (is_assigned_to_me(assigned_to) OR is_admin());

CREATE POLICY "Users can create touches"
ON public.kit_touches FOR INSERT TO authenticated
WITH CHECK (is_assigned_to_me(assigned_to) OR is_admin());

CREATE POLICY "Users can update accessible touches"
ON public.kit_touches FOR UPDATE TO authenticated
USING (is_assigned_to_me(assigned_to) OR is_admin());

CREATE POLICY "Admins can delete touches"
ON public.kit_touches FOR DELETE TO authenticated
USING (is_admin());
