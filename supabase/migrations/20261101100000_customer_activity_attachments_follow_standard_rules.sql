-- Customer activity attachments follow the standard attachment rules.
-- Idempotent. Apply AFTER 20261007100500_fix_attachment_access_and_close_customer_paths.sql.
--
-- Decision (owner, 2026-11-01): files attached to a customer's activity-log entry keep working like the ones
-- attached to lead, task and professional records:
--   * the file lives in the record's own folder  customer/<customer id>/...  of the bucket crm-attachments;
--   * admins and anyone who can see that customer (the customers table's own row level security decides)
--     can upload to it and read from it;
--   * the row in entity_attachments carries source_type = 'activity'.
--
-- What stays closed, exactly as before:
--   * the encrypted customer attachments (bucket customer-secure) are reached only through the
--     customer-attachments function;
--   * every customer row in entity_attachments that is NOT an activity attachment (the old plaintext
--     customer files) stays blocked for signed-in users; the function secures those when an admin opens
--     the customer;
--   * customer/ folders of customers the caller cannot see, and customer/ paths without a valid customer id.
-- The service role is not affected by any of this.

-- ---------------------------------------------------------------------------
-- Part 1: rows in public.entity_attachments
-- ---------------------------------------------------------------------------

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
        or (entity_type = 'customer' and coalesce(source_type, '') = 'activity' and exists (
          select 1 from public.customers c where c.id = entity_attachments.entity_id))
      )
    )
  );

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
        or (entity_type = 'customer' and coalesce(source_type, '') = 'activity' and exists (
          select 1 from public.customers c where c.id = entity_attachments.entity_id))
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
        or (entity_type = 'customer' and coalesce(source_type, '') = 'activity' and exists (
          select 1 from public.customers c where c.id = entity_attachments.entity_id))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Part 2: files in the crm-attachments bucket (upload and read get a customer branch)
-- ---------------------------------------------------------------------------

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
      or (
        (storage.foldername(objects.name))[1] = 'customer'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.customers c
          where c.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
    )
  );

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
      or (
        (storage.foldername(objects.name))[1] = 'customer'
        and (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.customers c
          where c.id = case
            when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then ((storage.foldername(objects.name))[2])::uuid
          end
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Part 3: the restrictive guards. A customer folder is reachable only when the caller can see that customer.
-- ---------------------------------------------------------------------------

drop policy if exists "Block legacy customer paths: select" on storage.objects;
create policy "Block legacy customer paths: select"
  on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
    or (
      (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.customers c
        where c.id = case
          when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(objects.name))[2])::uuid
        end
      )
    )
  );

drop policy if exists "Block legacy customer paths: insert" on storage.objects;
create policy "Block legacy customer paths: insert"
  on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
    or (
      (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.customers c
        where c.id = case
          when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(objects.name))[2])::uuid
        end
      )
    )
  );

drop policy if exists "Block legacy customer paths: update" on storage.objects;
create policy "Block legacy customer paths: update"
  on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
    or (
      (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.customers c
        where c.id = case
          when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(objects.name))[2])::uuid
        end
      )
    )
  )
  with check (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
    or (
      (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.customers c
        where c.id = case
          when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(objects.name))[2])::uuid
        end
      )
    )
  );

drop policy if exists "Block legacy customer paths: delete" on storage.objects;
create policy "Block legacy customer paths: delete"
  on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'crm-attachments'
    or coalesce((storage.foldername(objects.name))[1], '') <> 'customer'
    or (
      (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.customers c
        where c.id = case
          when (storage.foldername(objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(objects.name))[2])::uuid
        end
      )
    )
  );

drop policy if exists "Block legacy customer attachment rows" on public.entity_attachments;
create policy "Block legacy customer attachment rows"
  on public.entity_attachments
  as restrictive for all to authenticated
  using (entity_type <> 'customer' or coalesce(source_type, '') = 'activity')
  with check (entity_type <> 'customer' or coalesce(source_type, '') = 'activity');
