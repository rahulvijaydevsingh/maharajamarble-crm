-- Fix control_panel_options RLS policies
-- Drop overly permissive ALL policy
DROP POLICY IF EXISTS "Allow authenticated to manage control panel options" ON public.control_panel_options;

-- Create admin-only policies for INSERT, UPDATE, DELETE
CREATE POLICY "Admins can insert control panel options"
ON public.control_panel_options FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update control panel options"
ON public.control_panel_options FOR UPDATE
USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can delete control panel options"
ON public.control_panel_options FOR DELETE
USING (is_admin());

-- Fix control_panel_option_values RLS policies
-- Drop overly permissive ALL policy
DROP POLICY IF EXISTS "Allow authenticated to manage control panel option values" ON public.control_panel_option_values;

-- Create admin-only policies for INSERT, UPDATE, DELETE
CREATE POLICY "Admins can insert control panel option values"
ON public.control_panel_option_values FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update control panel option values"
ON public.control_panel_option_values FOR UPDATE
USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can delete control panel option values"
ON public.control_panel_option_values FOR DELETE
USING (is_admin());