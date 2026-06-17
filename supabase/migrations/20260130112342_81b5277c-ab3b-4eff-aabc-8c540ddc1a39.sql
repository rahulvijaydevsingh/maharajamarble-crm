-- Attachments infrastructure (retry without CREATE POLICY IF NOT EXISTS)

-- 1) Storage bucket for CRM attachments (private)
insert into storage.buckets (id, name, public)
values ('crm-attachments', 'crm-attachments', false)
on conflict (id) do nothing;

-- 2) Entity attachments table
create table if not exists public.entity_attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  file_path text not null,
  mime_type text null,
  file_size bigint null,
  uploaded_by text not null default public.get_current_user_email(),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_entity_attachments_entity on public.entity_attachments(entity_type, entity_id);
create index if not exists idx_entity_attachments_path on public.entity_attachments(file_path);

alter table public.entity_attachments enable row level security;

-- Policies for public.entity_attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'entity_attachments'
      AND policyname = 'Users can view attachments for accessible entities'
  ) THEN
    EXECUTE $p$
      create policy "Users can view attachments for accessible entities"
      on public.entity_attachments
      for select
      using (
        public.is_admin()
        or (
          entity_type = 'lead'
          and exists (
            select 1 from public.leads l
            where l.id = entity_id
              and (l.assigned_to = public.get_current_user_email() or l.created_by = public.get_current_user_email())
          )
        )
        or (
          entity_type = 'customer'
          and exists (
            select 1 from public.customers c
            where c.id = entity_id
              and (c.assigned_to = public.get_current_user_email() or c.created_by = public.get_current_user_email())
          )
        )
      )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'entity_attachments'
      AND policyname = 'Users can add attachments for accessible entities'
  ) THEN
    EXECUTE $p$
      create policy "Users can add attachments for accessible entities"
      on public.entity_attachments
      for insert
      with check (
        public.is_admin()
        or (
          entity_type = 'lead'
          and exists (
            select 1 from public.leads l
            where l.id = entity_id
              and (l.assigned_to = public.get_current_user_email() or l.created_by = public.get_current_user_email())
          )
        )
        or (
          entity_type = 'customer'
          and exists (
            select 1 from public.customers c
            where c.id = entity_id
              and (c.assigned_to = public.get_current_user_email() or c.created_by = public.get_current_user_email())
          )
        )
      )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'entity_attachments'
      AND policyname = 'Users can delete attachments for accessible entities'
  ) THEN
    EXECUTE $p$
      create policy "Users can delete attachments for accessible entities"
      on public.entity_attachments
      for delete
      using (
        public.is_admin()
        or (
          entity_type = 'lead'
          and exists (
            select 1 from public.leads l
            where l.id = entity_id
              and (l.assigned_to = public.get_current_user_email() or l.created_by = public.get_current_user_email())
          )
        )
        or (
          entity_type = 'customer'
          and exists (
            select 1 from public.customers c
            where c.id = entity_id
              and (c.assigned_to = public.get_current_user_email() or c.created_by = public.get_current_user_email())
          )
        )
      )
    $p$;
  END IF;
END$$;

-- 3) Add plus code to customers so it can be shown post-conversion
alter table public.customers
add column if not exists site_plus_code text;

-- 4) Track leads created from a customer (for copying history)
alter table public.leads
add column if not exists created_from_customer_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_created_from_customer_id_fkey'
  ) THEN
    EXECUTE 'alter table public.leads add constraint leads_created_from_customer_id_fkey foreign key (created_from_customer_id) references public.customers(id) on delete set null';
  END IF;
END$$;

-- 5) Storage policies (bucket is private)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated can upload crm attachments'
  ) THEN
    EXECUTE $p$
      create policy "Authenticated can upload crm attachments"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'crm-attachments')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can read crm attachments via attachment access'
  ) THEN
    EXECUTE $p$
      create policy "Users can read crm attachments via attachment access"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'crm-attachments'
        and exists (
          select 1
          from public.entity_attachments ea
          where ea.file_path = storage.objects.name
        )
      )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can delete crm attachments'
  ) THEN
    EXECUTE $p$
      create policy "Admins can delete crm attachments"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'crm-attachments' and public.is_admin())
    $p$;
  END IF;
END$$;
