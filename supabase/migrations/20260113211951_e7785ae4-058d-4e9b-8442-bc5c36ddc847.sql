-- Create activity_log table for comprehensive activity tracking
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_category TEXT NOT NULL DEFAULT 'system',
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT 'System',
  activity_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  is_manual BOOLEAN NOT NULL DEFAULT false,
  is_editable BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,
  color TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for better query performance
CREATE INDEX idx_activity_log_lead_id ON public.activity_log(lead_id);
CREATE INDEX idx_activity_log_customer_id ON public.activity_log(customer_id);
CREATE INDEX idx_activity_log_timestamp ON public.activity_log(activity_timestamp DESC);
CREATE INDEX idx_activity_log_activity_type ON public.activity_log(activity_type);
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_category ON public.activity_log(activity_category);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow authenticated users to view activity logs"
ON public.activity_log
FOR SELECT
USING (true);

CREATE POLICY "Allow authenticated users to create activity logs"
ON public.activity_log
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow admins to update activity logs"
ON public.activity_log
FOR UPDATE
USING (true);

CREATE POLICY "Allow admins to delete activity logs"
ON public.activity_log
FOR DELETE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_activity_log_updated_at
BEFORE UPDATE ON public.activity_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to leads table for conversion tracking
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS converted_to_customer_id UUID REFERENCES public.customers(id),
ADD COLUMN IF NOT EXISTS is_converted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE;

-- Add columns to customers table for source tracking
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS created_from_lead_id UUID REFERENCES public.leads(id),
ADD COLUMN IF NOT EXISTS is_repeat_customer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_lead_id UUID;

-- Enable realtime for activity_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;