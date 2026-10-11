-- Attachment access fix and closing of the legacy plaintext customer paths.
-- Idempotent. On production this is applied AFTER the application code has been merged and the old
-- customer file has been secured (the function does that automatically the first time an admin
-- opens that customer's Attachments tab).
--
-- Why this exists
--   The old upload rule compared the lead/customer/professional NAME column where it meant the file
--   path, and every access rule compared full names with e-mail addresses. Result: nobody could
--   upload to lead, customer or professional folders, and non-admin staff could not see attachments
--   on their own records.
--
-- New rules
--   1. A file belongs to ONE record and lives in that record's own folder: lead/<id>/..., task/<id>/...,
--      professional/<id>/.... Whoever can see that record (assigned to me, created by me, or admin; the
--      parent tables' own row level security decides) can upload to and read from that folder.
--   2. An attachment row can only point at a file in its own record's folder, or at a bulk-import file
--      (imports/..., lead-photos/...) that the same person uploaded. Nobody can link their own record to
--      somebody else's file to read it.
--   3. Bulk-import source sheets (imports/...) hold the data of many leads, so they stay readable only by
--      the person who uploaded them and by admins; the rows that point at them are admin-only too.
--   4. Admins keep their existing ability to see every row and every file (customer folders excepted).
--   5. Customer files no longer live in this bucket at all.

-- ---------------------------------------------------------------------------
-- Part 1: rows in public.entity_attachments
-- ---------------------------------------------------------------------------

-- View: admins see everything. Others see lead, task and professional rows whose parent record they can
-- see, except rows that point at bulk-import source sheets.
drop policy if exists "Users can view attachments for accessible entities" on public.entity_attachments;
create policy "Users can view attachments for accessible entities"
  on public.entity_attachments
  as permissive for select to authenticated
  using (
    public.is_admin()
    or (
      coalesce(file_path, '') not like 'imports/%'
      and (
        (entity_type = 'lead' and exists (
          select 1 from public.leads l where l.id = entity_attachments.entity_id))
        or (entity_type = 'task' and exists (
          select 1 from public.tasks t where t.id = entity_attachments.entity_id))
        or (entity_type = 'professional' and exists (
          select 1 from public.professionals p where p.id = entity_attachments.entity_id))
      )
    )
  );

-- Helper for the "add" rule below: did the caller upload the file at this path? It is a SECURITY DEFINER
-- function on purpose: asking the storage table directly from inside this table's own policy would make the
-- two tables' policies call each other endlessly ("infinite recursion detected in policy"). It only ever
-- answers about the caller's own uploads.
create or replace function public.crm_object_uploaded_by_me(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'crm-attachments'
      and o.name = p_path
      and o.owner_id = (auth.uid())::text
  );
$$;

revoke all on function public.crm_object_uploaded_by_me(text) from public, anon;
grant execute on function public.crm_object_uploaded_by_me(text) to authenticated;

-- Add: the parent record must be visible AND the row may only point at a file in its own record's folder,
-- or at an imports/ or lead-photos/ file that the caller uploaded.
drop policy if exists "Users can add attachments for accessible entities" on public.entity_attachments;
create policy "Users can add attachments for accessible entities"
  on public.entity_attachments
  as permissive for insert to authenticated
  with check (
    public.is_admin()
    or (
      (
        (entity_type = 'lead' and exists (
          select 1 from public.leads l where l.id = entity_attachments.entity_id))
        or (entity_type = 'task' and exists (
          select 1 from public.tasks t where t.id = entity_attachments.entity_id))
        or (entity_type = 'professional' and exists (
          select 1 from public.professionals p where p.id = entity_attachments.entity_id))
      )
      and (
        file_path is null
        or file_path like entity_type || '/' || entity_id::text || '/%'
        or (
          (storage.foldername(file_path))[1] = any (array['imports', 'lead-photos'])
          and public.crm_object_uploaded_by_me(file_path)
        )
      )
    )
  );

-- Delete: same people who can view the row.
drop policy if exists "Users can delete attachments for accessible entities" on public.entity_attachments;
create policy "Users can delete attachments for accessible entities"
  on public.entity_attachments
  as permissive for delete to authenticated
  using (
    public.is_admin()
    or (
      coalesce(file_path, '') not like 'imports/%'
      and (
        (entity_type = 'lead' and exists (
          select 1 from public.leads l where l.id = entity_attachments.entity_id))
        or (entity_type = 'task' and exists (
          select 1 from public.tasks t where t.id = entity_attachments.entity_id))
        or (entity_type = 'professional' and exists (
          select 1 from public.professionals p where p.id = entity_attachments.entity_id))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Part 2: files in the crm-attachments bucket
-- ---------------------------------------------------------------------------

-- Upload: the folder is imports/, lead-photos/, or {lead|task|professional}/{record id}/... and the caller
-- can see that record. The id is cast only when it matches the uuid pattern, and every reference to the
-- object name is qualified (objects.name) so it can never be confused with a "name" column of the
-- parent table.
drop policy if exists "Authenticated can upload authorized crm attachments" on storage.objects;
create policy "Authenticated can upload authorized crm attachments"
  on storage.objects
  as permissive for insert to authenticated
  with check (
    bucket_id = 'crm-attachments'
    and (
      (storage.foldername(objects.name))[1] = any (array['imports', 'lead-photos'])
      or (
        (storage.foldername(objects.name))[1] = 'lead'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.leads l
          where l.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
      or (
        (storage.foldername(objects.name))[1] = 'task'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.tasks t
          where t.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
      or (
        (storage.foldername(objects.name))[1] = 'professional'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.professionals p
          where p.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
    )
  );

-- Read, decided by the file's own location (never by a row that someone could have pointed anywhere):
--   admins: every file;
--   imports/ and lead-photos/: the person who uploaded it;
--   lead-photos/: also anyone who can see a lead row that points at it (those rows can only be created
--     by the uploader, see the "add" rule above);
--   lead/, task/, professional/: anyone who can see the record whose id is in the path.
-- Bulk-import source sheets (imports/) are therefore readable only by the uploader and admins.
drop policy if exists "Users can read crm attachments via attachment access" on storage.objects;
create policy "Users can read crm attachments via attachment access"
  on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'crm-attachments'
    and (
      public.is_admin()
      or (
        (storage.foldername(objects.name))[1] = any (array['imports', 'lead-photos'])
        and objects.owner_id = (auth.uid())::text
      )
      or (
        (storage.foldername(objects.name))[1] = 'lead-photos'
        and exists (
          select 1 from public.entity_attachments ea
          where ea.file_path = objects.name
        )
      )
      or (
        (storage.foldername(objects.name))[1] = 'lead'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.leads l
          where l.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
      or (
        (storage.foldername(objects.name))[1] = 'task'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.tasks t
          where t.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
      or (
        (storage.foldername(objects.name))[1] = 'professional'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.professionals p
          where p.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
    )
  );

-- Deleting files stays admin-only ("Admins can delete crm attachments" is not touched here).

-- ---------------------------------------------------------------------------
-- Part 3: close the legacy plaintext customer paths (defence in depth)
-- ---------------------------------------------------------------------------
-- Restrictive policies are ANDed with every permissive policy, so even a future permissive
-- policy cannot expose customer/ paths in crm-attachments or customer rows in entity_attachments.
-- The service role is not affected.

drop policy if exists "Block legacy customer paths: select" on storage.objects;
create policy "Block legacy customer paths: select"
  on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
  );

drop policy if exists "Block legacy customer paths: insert" on storage.objects;
create policy "Block legacy customer paths: insert"
  on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
  );

drop policy if exists "Block legacy customer paths: update" on storage.objects;
create policy "Block legacy customer paths: update"
  on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
  )
  with check (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
  );

drop policy if exists "Block legacy customer paths: delete" on storage.objects;
create policy "Block legacy customer paths: delete"
  on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
  );

drop policy if exists "Block legacy customer attachment rows" on public.entity_attachments;
create policy "Block legacy customer attachment rows"
  on public.entity_attachments
  as restrictive for all to authenticated
  using (entity_type <> 'customer')
  with check (entity_type <> 'customer');
