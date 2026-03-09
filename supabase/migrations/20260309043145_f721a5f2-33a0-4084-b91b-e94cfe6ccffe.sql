
-- WhatsApp sessions per user
CREATE TABLE public.whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  instance_name TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  session_type TEXT NOT NULL DEFAULT 'personal',
  connected_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message log
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  sent_by UUID REFERENCES public.profiles(id),
  lead_id UUID REFERENCES public.leads(id),
  customer_id UUID REFERENCES public.customers(id),
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  message_body TEXT,
  media_url TEXT,
  template_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  evolution_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message queue for automated/bulk sends
CREATE TABLE public.whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  lead_id UUID REFERENCES public.leads(id),
  customer_id UUID REFERENCES public.customers(id),
  message_type TEXT NOT NULL DEFAULT 'text',
  message_body TEXT,
  media_url TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  is_bulk BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp module settings (singleton)
CREATE TABLE public.whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_enabled BOOLEAN NOT NULL DEFAULT false,
  evolution_api_url TEXT,
  daily_limit_main INTEGER NOT NULL DEFAULT 200,
  daily_limit_bulk INTEGER NOT NULL DEFAULT 100,
  delay_between_msgs_seconds INTEGER NOT NULL DEFAULT 10,
  bulk_instance_name TEXT,
  auto_send_quotations BOOLEAN NOT NULL DEFAULT false,
  auto_send_reminders BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

-- Sessions: users see own, admins see all
CREATE POLICY "Users can view own sessions" ON public.whatsapp_sessions FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Users can insert own sessions" ON public.whatsapp_sessions FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Users can update own sessions" ON public.whatsapp_sessions FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Admins can delete sessions" ON public.whatsapp_sessions FOR DELETE USING (public.is_admin());

-- Messages: users see own sent, admins see all
CREATE POLICY "Users can view own messages" ON public.whatsapp_messages FOR SELECT USING (sent_by = auth.uid() OR public.is_admin());
CREATE POLICY "Users can insert messages" ON public.whatsapp_messages FOR INSERT WITH CHECK (sent_by = auth.uid() OR public.is_admin());
CREATE POLICY "Admins can update messages" ON public.whatsapp_messages FOR UPDATE USING (public.is_admin());

-- Queue: admins manage, users can insert
CREATE POLICY "Users can view queue" ON public.whatsapp_queue FOR SELECT USING (public.is_admin());
CREATE POLICY "Users can insert queue items" ON public.whatsapp_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update queue" ON public.whatsapp_queue FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete queue" ON public.whatsapp_queue FOR DELETE USING (public.is_admin());

-- Settings: all read, admin write
CREATE POLICY "All can view settings" ON public.whatsapp_settings FOR SELECT USING (true);
CREATE POLICY "Admins can insert settings" ON public.whatsapp_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update settings" ON public.whatsapp_settings FOR UPDATE USING (public.is_admin());

-- Insert default settings row
INSERT INTO public.whatsapp_settings (module_enabled) VALUES (false);
