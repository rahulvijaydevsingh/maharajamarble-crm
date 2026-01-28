-- Create leads table with all form fields and system tracking
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'System',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Contact details (primary contact)
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  email TEXT,
  designation TEXT NOT NULL DEFAULT 'owner',
  firm_name TEXT,
  
  -- Additional contacts (JSON array)
  additional_contacts JSONB DEFAULT '[]'::jsonb,
  
  -- Site details
  site_location TEXT,
  site_photo_url TEXT,
  site_plus_code TEXT,
  construction_stage TEXT,
  estimated_quantity NUMERIC,
  material_interests TEXT[] DEFAULT '{}',
  
  -- Source & relationship
  source TEXT NOT NULL DEFAULT 'walk_in',
  referred_by JSONB,
  assigned_to TEXT NOT NULL,
  
  -- Status and tracking
  status TEXT NOT NULL DEFAULT 'new',
  priority INTEGER NOT NULL DEFAULT 3,
  notes TEXT,
  address TEXT,
  
  -- Follow-up tracking (auto-updated from tasks)
  last_follow_up TIMESTAMP WITH TIME ZONE,
  next_follow_up TIMESTAMP WITH TIME ZONE
);

-- Create tasks table linked to leads
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'System',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'Follow-up Call',
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Pending',
  
  assigned_to TEXT NOT NULL,
  due_date DATE NOT NULL,
  due_time TEXT,
  
  -- Link to lead (optional)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  reminder BOOLEAN DEFAULT false,
  reminder_time TEXT,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create public access policies (no auth required for now - can be restricted later)
CREATE POLICY "Allow all access to leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update lead follow-up dates when tasks change
CREATE OR REPLACE FUNCTION public.update_lead_followup_dates()
RETURNS TRIGGER AS $$
DECLARE
  target_lead_id UUID;
  latest_completed TIMESTAMP WITH TIME ZONE;
  next_pending DATE;
BEGIN
  -- Determine which lead_id to update
  IF TG_OP = 'DELETE' THEN
    target_lead_id := OLD.lead_id;
  ELSE
    target_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  END IF;
  
  -- Exit if no lead linked
  IF target_lead_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Get the latest completed task date for last_follow_up
  SELECT MAX(completed_at) INTO latest_completed
  FROM public.tasks
  WHERE lead_id = target_lead_id AND status = 'Completed';
  
  -- Get the earliest pending/in-progress task date for next_follow_up
  SELECT MIN(due_date) INTO next_pending
  FROM public.tasks
  WHERE lead_id = target_lead_id AND status IN ('Pending', 'In Progress');
  
  -- Update the lead
  UPDATE public.leads
  SET 
    last_follow_up = latest_completed,
    next_follow_up = next_pending::timestamp with time zone
  WHERE id = target_lead_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for auto-updating lead follow-up dates
CREATE TRIGGER update_lead_followup_on_task_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_followup_dates();

CREATE TRIGGER update_lead_followup_on_task_update
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_followup_dates();

CREATE TRIGGER update_lead_followup_on_task_delete
  AFTER DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_followup_dates();

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;