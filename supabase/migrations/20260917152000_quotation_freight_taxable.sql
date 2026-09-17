-- Quotation form: freight taxability defaults to taxable for both preview and production.
alter table public.quotations
  add column if not exists freight_taxable boolean not null default true;

update public.quotations
set freight_taxable = true
where freight_taxable is null;
