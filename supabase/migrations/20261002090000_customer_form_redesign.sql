alter table public.customers
  add column if not exists additional_contacts jsonb not null default '[]'::jsonb,
  add column if not exists referred_by text,
  add column if not exists referred_by_professional_id uuid references public.professionals(id) on delete set null,
  add column if not exists profession text,
  add column if not exists materials_purchased text[] not null default '{}',
  add column if not exists quantity_purchased numeric,
  add column if not exists quantity_unit text not null default 'sqft',
  add column if not exists bill_number text,
  add column if not exists pending_followups text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from public.control_panel_options
    where module_name = 'customers'
      and field_name = 'pending_followup'
  ) then
    insert into public.control_panel_options (
      module_name,
      field_name,
      display_name,
      allow_colors
    )
    values (
      'customers',
      'pending_followup',
      'Pending Follow-up',
      false
    );
  end if;
end
$$;

insert into public.control_panel_option_values (
  field_id,
  label,
  value,
  color,
  is_active,
  is_default,
  is_system_reserved,
  sort_order
)
select
  o.id,
  v.label,
  v.value,
  null,
  true,
  false,
  false,
  v.sort_order
from public.control_panel_options o
cross join (
  values
    ('Kitchen pending', 'kitchen_pending', 1),
    ('Furniture pending', 'furniture_pending', 2)
) as v(label, value, sort_order)
where o.module_name = 'customers'
  and o.field_name = 'pending_followup'
  and not exists (
    select 1
    from public.control_panel_option_values existing
    where existing.field_id = o.id
      and existing.value = v.value
  );

delete from public.control_panel_option_values
where field_id in (
  select id
  from public.control_panel_options
  where module_name = 'customers'
    and field_name in ('city', 'industry', 'customer_source')
);

delete from public.control_panel_options
where module_name = 'customers'
  and field_name in ('city', 'industry', 'customer_source');
