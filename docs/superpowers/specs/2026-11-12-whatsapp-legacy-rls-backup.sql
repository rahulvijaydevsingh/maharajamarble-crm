-- ============================================================================
-- Legacy WhatsApp RLS Policies Snapshot (Captured from wgffvhbzhexptvdraczc
-- on 2026-11-12 before Migration M0).
-- All 14 policies had schemaname = public, permissive = PERMISSIVE, roles = {public}.
-- ============================================================================

-- 1. whatsapp_messages
CREATE POLICY "Admins can update messages"
  ON public.whatsapp_messages
  AS PERMISSIVE FOR UPDATE TO public
  USING (is_admin());

CREATE POLICY "Users can insert messages"
  ON public.whatsapp_messages
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((sent_by = auth.uid()) OR is_admin()));

CREATE POLICY "Users can view own messages"
  ON public.whatsapp_messages
  AS PERMISSIVE FOR SELECT TO public
  USING (((sent_by = auth.uid()) OR is_admin()));

-- 2. whatsapp_queue
CREATE POLICY "Admins can delete queue"
  ON public.whatsapp_queue
  AS PERMISSIVE FOR DELETE TO public
  USING (is_admin());

CREATE POLICY "Admins can update queue"
  ON public.whatsapp_queue
  AS PERMISSIVE FOR UPDATE TO public
  USING (is_admin());

CREATE POLICY "Authenticated can insert queue items"
  ON public.whatsapp_queue
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Users can view queue"
  ON public.whatsapp_queue
  AS PERMISSIVE FOR SELECT TO public
  USING (is_admin());

-- 3. whatsapp_sessions
CREATE POLICY "Admins can delete sessions"
  ON public.whatsapp_sessions
  AS PERMISSIVE FOR DELETE TO public
  USING (is_admin());

CREATE POLICY "Users can insert own sessions"
  ON public.whatsapp_sessions
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = auth.uid()) OR is_admin()));

CREATE POLICY "Users can update own sessions"
  ON public.whatsapp_sessions
  AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) OR is_admin()));

CREATE POLICY "Users can view own sessions"
  ON public.whatsapp_sessions
  AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR is_admin()));

-- 4. whatsapp_settings
CREATE POLICY "Admins can insert settings"
  ON public.whatsapp_settings
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update settings"
  ON public.whatsapp_settings
  AS PERMISSIVE FOR UPDATE TO public
  USING (is_admin());

CREATE POLICY "All can view settings"
  ON public.whatsapp_settings
  AS PERMISSIVE FOR SELECT TO public
  USING (true);
