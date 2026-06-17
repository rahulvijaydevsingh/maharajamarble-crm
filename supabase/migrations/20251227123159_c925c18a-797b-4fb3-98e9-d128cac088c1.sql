-- Add new columns to tasks table for enhanced functionality
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS related_entity_type text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS related_entity_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_frequency text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_interval integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS recurrence_days_of_week text[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_day_of_month integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_month integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_reset_from_completion boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_end_type text DEFAULT 'never',
ADD COLUMN IF NOT EXISTS recurrence_end_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_occurrences_limit integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_occurrences_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS snoozed_until timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_due_date date DEFAULT NULL;

-- Create task_subtasks table
CREATE TABLE IF NOT EXISTS public.task_subtasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone DEFAULT NULL,
  sort_order integer DEFAULT 0,
  assigned_to text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on task_subtasks
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for task_subtasks
CREATE POLICY "Allow all access to task_subtasks" ON public.task_subtasks
FOR ALL USING (true) WITH CHECK (true);

-- Create todo_lists table
CREATE TABLE IF NOT EXISTS public.todo_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT NULL,
  color text DEFAULT '#3b82f6',
  icon text DEFAULT 'list',
  is_pinned boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  is_shared boolean DEFAULT false,
  shared_with text[] DEFAULT '{}',
  created_by text NOT NULL DEFAULT 'System',
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on todo_lists
ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for todo_lists
CREATE POLICY "Allow all access to todo_lists" ON public.todo_lists
FOR ALL USING (true) WITH CHECK (true);

-- Create todo_items table
CREATE TABLE IF NOT EXISTS public.todo_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id uuid NOT NULL REFERENCES public.todo_lists(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text DEFAULT NULL,
  is_completed boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  due_date date DEFAULT NULL,
  assigned_to text DEFAULT NULL,
  converted_to_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0,
  created_by text NOT NULL DEFAULT 'System',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone DEFAULT NULL
);

-- Enable RLS on todo_items
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for todo_items
CREATE POLICY "Allow all access to todo_items" ON public.todo_items
FOR ALL USING (true) WITH CHECK (true);

-- Create task_snooze_history table
CREATE TABLE IF NOT EXISTS public.task_snooze_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  original_due_date date NOT NULL,
  original_due_time text,
  snoozed_until timestamp with time zone NOT NULL,
  snooze_reason text DEFAULT NULL,
  created_by text NOT NULL DEFAULT 'System',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on task_snooze_history
ALTER TABLE public.task_snooze_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for task_snooze_history
CREATE POLICY "Allow all access to task_snooze_history" ON public.task_snooze_history
FOR ALL USING (true) WITH CHECK (true);

-- Create triggers for updated_at
CREATE TRIGGER update_task_subtasks_updated_at
  BEFORE UPDATE ON public.task_subtasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_todo_lists_updated_at
  BEFORE UPDATE ON public.todo_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_todo_items_updated_at
  BEFORE UPDATE ON public.todo_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_subtasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.todo_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.todo_items;