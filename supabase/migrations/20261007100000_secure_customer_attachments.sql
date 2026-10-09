-- Secure customer attachments: private ciphertext bucket, metadata tables, permission check.
-- Additive and idempotent. Safe to apply before the application code is merged.

-- 1) Private bucket that holds ciphertext only.
--    No policy exists for anon or authenticated on this bucket, so only the
--    Edge Function (service role) can read or write it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-secure', 'customer-secure', false, 11010048)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- 2) Metadata for encrypted files (one row per file).
create table if not exists public.customer_secure_attachments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_path text not null unique,
  wrapped_dek text not null,
  file_iv text not null,
  key_version integer not null,
  uploaded_by uuid,
  uploaded_by_name text,
  source_lead_id uuid,
  source_lead_attachment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_secure_attachments_customer_idx
  on public.customer_secure_attachments (customer_id);

-- A lead file can be imported into a customer only once (makes imports repeatable).
create unique index if not exists customer_secure_attachments_lead_import_uidx
  on public.customer_secure_attachments (customer_id, source_lead_attachment_id)
  where source_lead_attachment_id is not null;

-- 3) Access log (written by the Edge Function; no UI in this release).
create table if not exists public.customer_attachment_access_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  attachment_id uuid,
  action text not null,
  actor_id uuid,
  actor_name text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_attachment_access_log_customer_idx
  on public.customer_attachment_access_log (customer_id, created_at desc);

-- 4) Lock both tables: row level security on, no policies, no privileges for client roles.
alter table public.customer_secure_attachments enable row level security;
alter table public.customer_attachment_access_log enable row level security;

revoke all on public.customer_secure_attachments from anon, authenticated;
revoke all on public.customer_attachment_access_log from anon, authenticated;

-- 5) Permission check used by the app (to show or hide the manager view)
--    and by the Edge Function (as the real gate).
create or replace function public.can_manage_customer_attachments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.user_roles ur
      join public.custom_role_permissions crp on crp.role = ur.role::text
      where ur.user_id = auth.uid()
        and 'customers.manage_attachments' = any (crp.permissions)
    );
$$;

revoke all on function public.can_manage_customer_attachments() from public, anon;
grant execute on function public.can_manage_customer_attachments() to authenticated;
