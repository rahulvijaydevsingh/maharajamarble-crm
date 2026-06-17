-- Tighten storage read access for crm-attachments to match entity access

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can read crm attachments via attachment access'
  ) THEN
    EXECUTE 'drop policy "Users can read crm attachments via attachment access" on storage.objects';
  END IF;
END$$;

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
      and (
        public.is_admin()
        or (
          ea.entity_type = 'lead'
          and exists (
            select 1 from public.leads l
            where l.id = ea.entity_id
              and (l.assigned_to = public.get_current_user_email() or l.created_by = public.get_current_user_email())
          )
        )
        or (
          ea.entity_type = 'customer'
          and exists (
            select 1 from public.customers c
            where c.id = ea.entity_id
              and (c.assigned_to = public.get_current_user_email() or c.created_by = public.get_current_user_email())
          )
        )
      )
  )
);
