-- Quotation form contract: freight, per-quotation terms, and secure quotation attachments.
-- Safe for environments where these columns/policies already exist.

alter table public.quotations
  add column if not exists freight_amount numeric not null default 0,
  add column if not exists terms_and_conditions text;

alter table public.company_settings
  add column if not exists quotation_terms_and_conditions text;

update public.company_settings
set quotation_terms_and_conditions = coalesce(
  quotation_terms_and_conditions,
  'All disputes subject to Chandigarh jurisdiction only.\nInterest @18% per annum will be charged if bills are not paid within 15 days.\nGoods once sold will not be taken back.'
)
where quotation_terms_and_conditions is null;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can upload quotation attachments'
  ) then
    create policy "Users can upload quotation attachments"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'crm-attachments' and name like 'quotations/%');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can view quotation attachments'
  ) then
    create policy "Users can view quotation attachments"
      on storage.objects for select to authenticated
      using (bucket_id = 'crm-attachments' and name like 'quotations/%');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can delete quotation attachments'
  ) then
    create policy "Users can delete quotation attachments"
      on storage.objects for delete to authenticated
      using (bucket_id = 'crm-attachments' and name like 'quotations/%');
  end if;
end $$;
