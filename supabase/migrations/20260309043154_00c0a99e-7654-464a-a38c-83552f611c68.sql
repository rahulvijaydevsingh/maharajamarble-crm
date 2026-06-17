
DROP POLICY "Users can insert queue items" ON public.whatsapp_queue;
CREATE POLICY "Authenticated can insert queue items" ON public.whatsapp_queue FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
