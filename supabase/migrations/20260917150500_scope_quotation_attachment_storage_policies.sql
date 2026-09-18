-- Restrict quotation attachment storage access to users who can access the parent quotation.

drop policy if exists "Users can upload quotation attachments" on storage.objects;
drop policy if exists "Users can view quotation attachments" on storage.objects;
drop policy if exists "Users can delete quotation attachments" on storage.objects;

create policy "Users can upload quotation attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'crm-attachments'
    and name ~ '^quotations/[0-9a-fA-F-]{36}/'
    and exists (
      select 1 from public.quotations q
      where q.id::text = split_part(name, '/', 2)
        and (q.assigned_to = get_current_user_email() or q.created_by = get_current_user_email() or is_admin())
    )
  );

create policy "Users can view quotation attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'crm-attachments'
    and name ~ '^quotations/[0-9a-fA-F-]{36}/'
    and exists (
      select 1 from public.quotations q
      where q.id::text = split_part(name, '/', 2)
        and (q.assigned_to = get_current_user_email() or q.created_by = get_current_user_email() or is_admin())
    )
  );

create policy "Users can delete quotation attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'crm-attachments'
    and name ~ '^quotations/[0-9a-fA-F-]{36}/'
    and exists (
      select 1 from public.quotations q
      where q.id::text = split_part(name, '/', 2)
        and (q.assigned_to = get_current_user_email() or q.created_by = get_current_user_email() or is_admin())
    )
  );
