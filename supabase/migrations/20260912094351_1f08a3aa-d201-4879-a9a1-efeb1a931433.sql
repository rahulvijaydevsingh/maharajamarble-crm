DROP POLICY IF EXISTS "Users can add attachments for accessible entities" ON public.entity_attachments;
CREATE POLICY "Users can add attachments for accessible entities"
ON public.entity_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    entity_type = 'lead'
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = entity_attachments.entity_id
        AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = entity_attachments.entity_id
        AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = entity_attachments.entity_id
        AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'professional'
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = entity_attachments.entity_id
        AND (p.assigned_to = public.get_current_user_email() OR p.created_by = public.get_current_user_email())
    )
  )
);

DROP POLICY IF EXISTS "Users can view attachments for accessible entities" ON public.entity_attachments;
CREATE POLICY "Users can view attachments for accessible entities"
ON public.entity_attachments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    entity_type = 'lead'
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = entity_attachments.entity_id
        AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = entity_attachments.entity_id
        AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = entity_attachments.entity_id
        AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'professional'
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = entity_attachments.entity_id
        AND (p.assigned_to = public.get_current_user_email() OR p.created_by = public.get_current_user_email())
    )
  )
);

DROP POLICY IF EXISTS "Users can delete attachments for accessible entities" ON public.entity_attachments;
CREATE POLICY "Users can delete attachments for accessible entities"
ON public.entity_attachments
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (
    entity_type = 'lead'
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = entity_attachments.entity_id
        AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = entity_attachments.entity_id
        AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = entity_attachments.entity_id
        AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email())
    )
  )
  OR (
    entity_type = 'professional'
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = entity_attachments.entity_id
        AND (p.assigned_to = public.get_current_user_email() OR p.created_by = public.get_current_user_email())
    )
  )
);

DROP POLICY IF EXISTS "Authenticated can upload authorized crm attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload authorized crm attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'crm-attachments'
  AND (
    (storage.foldername(name))[1] IN ('imports', 'lead-photos')
    OR (
      (storage.foldername(name))[1] = 'lead'
      AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = ((storage.foldername(name))[2])::uuid
          AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email() OR public.is_admin())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'customer'
      AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = ((storage.foldername(name))[2])::uuid
          AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email() OR public.is_admin())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'task'
      AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = ((storage.foldername(name))[2])::uuid
          AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email() OR public.is_admin())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'professional'
      AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.professionals p
        WHERE p.id = ((storage.foldername(name))[2])::uuid
          AND (p.assigned_to = public.get_current_user_email() OR p.created_by = public.get_current_user_email() OR public.is_admin())
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can read crm attachments via attachment access" ON storage.objects;
CREATE POLICY "Users can read crm attachments via attachment access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'crm-attachments'
  AND (
    ((storage.foldername(name))[1] IN ('imports', 'lead-photos') AND owner_id = (auth.uid())::text)
    OR EXISTS (
      SELECT 1 FROM public.entity_attachments ea
      WHERE ea.file_path = objects.name
        AND (
          public.is_admin()
          OR (
            ea.entity_type = 'lead'
            AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = ea.entity_id AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email()))
          )
          OR (
            ea.entity_type = 'customer'
            AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ea.entity_id AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email()))
          )
          OR (
            ea.entity_type = 'task'
            AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = ea.entity_id AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email()))
          )
          OR (
            ea.entity_type = 'professional'
            AND EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = ea.entity_id AND (p.assigned_to = public.get_current_user_email() OR p.created_by = public.get_current_user_email()))
          )
        )
    )
  )
);