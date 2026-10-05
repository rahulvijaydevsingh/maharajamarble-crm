-- Remove the Customer Type option list from the Control Panel.
-- Customer type is no longer captured on any form (contact designation covers it).
-- The customers.customer_type column itself is kept (NOT NULL, default 'individual'),
-- so no customer data and no table structure changes.
delete from public.control_panel_option_values
where field_id in (
  select id
  from public.control_panel_options
  where module_name = 'customers'
    and field_name = 'customer_type'
);

delete from public.control_panel_options
where module_name = 'customers'
  and field_name = 'customer_type';
