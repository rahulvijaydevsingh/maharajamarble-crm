-- Create reminders table
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  reminder_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  is_snoozed BOOLEAN NOT NULL DEFAULT false,
  snooze_until TIMESTAMP WITH TIME ZONE,
  
  -- Linked entity (can be linked to lead, customer, professional, task, or quotation)
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'customer', 'professional', 'task', 'quotation')),
  entity_id UUID NOT NULL,
  
  -- Recurrence settings
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_end_date DATE,
  
  -- Metadata
  created_by TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for reminders
CREATE POLICY "Users can view all reminders"
ON public.reminders
FOR SELECT
USING (true);

CREATE POLICY "Users can create reminders"
ON public.reminders
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update reminders"
ON public.reminders
FOR UPDATE
USING (true);

CREATE POLICY "Users can delete reminders"
ON public.reminders
FOR DELETE
USING (true);

-- Create index for efficient querying
CREATE INDEX idx_reminders_entity ON public.reminders(entity_type, entity_id);
CREATE INDEX idx_reminders_datetime ON public.reminders(reminder_datetime);
CREATE INDEX idx_reminders_assigned ON public.reminders(assigned_to);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_reminders_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for reminders
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;