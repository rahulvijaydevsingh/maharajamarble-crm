-- Activate professional designations in control panel option values for leads
UPDATE public.control_panel_option_values
SET is_active = true
WHERE field_id IN (
  SELECT id FROM public.control_panel_options WHERE module_name = 'leads' AND field_name = 'designation'
)
AND value IN ('architect', 'builder', 'contractor', 'interior_designer', 'site_supervisor', 'real_estate_developer');
