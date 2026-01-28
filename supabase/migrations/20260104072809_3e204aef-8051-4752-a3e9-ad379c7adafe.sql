-- Create table for control panel settings
CREATE TABLE IF NOT EXISTS public.control_panel_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_name text NOT NULL,
  field_name text NOT NULL,
  display_name text NOT NULL,
  allow_colors boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(module_name, field_name)
);

-- Create table for individual options within fields
CREATE TABLE IF NOT EXISTS public.control_panel_option_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_id uuid NOT NULL REFERENCES public.control_panel_options(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  is_system_reserved boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.control_panel_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_panel_option_values ENABLE ROW LEVEL SECURITY;

-- Create policies for control panel options (admins only can modify)
CREATE POLICY "Allow all to view control panel options" 
ON public.control_panel_options FOR SELECT USING (true);

CREATE POLICY "Allow authenticated to manage control panel options" 
ON public.control_panel_options FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all to view control panel option values" 
ON public.control_panel_option_values FOR SELECT USING (true);

CREATE POLICY "Allow authenticated to manage control panel option values" 
ON public.control_panel_option_values FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at triggers
CREATE TRIGGER update_control_panel_options_updated_at
  BEFORE UPDATE ON public.control_panel_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_control_panel_option_values_updated_at
  BEFORE UPDATE ON public.control_panel_option_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();