-- Permanent follow-up recalculation privilege fix and crm-attachments storage hardening.
-- Canonical model: SECURITY DEFINER functions remain in place; authenticated is granted
-- EXECUTE because triggers can invoke the wrapper in authenticated request context.

GRANT EXECUTE ON FUNCTION public.recalculate_lead_follow_up(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_lead_follow_up_trigger() TO authenticated;

DROP POLICY IF EXISTS "Authenticated can upload crm attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload authorized crm attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'crm-attachments'
  AND owner = auth.uid()
  AND (
    (storage.foldername(name))[1] IN ('imports', 'lead-photos')
    OR (
      (storage.foldername(name))[1] = 'lead'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id::text = (storage.foldername(name))[2]
          AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email() OR public.is_admin())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'customer'
      AND EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id::text = (storage.foldername(name))[2]
          AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email() OR public.is_admin())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'task'
      AND EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id::text = (storage.foldername(name))[2]
          AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email() OR public.is_admin())
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
    (
      (storage.foldername(name))[1] IN ('imports', 'lead-photos')
      AND owner = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.entity_attachments ea
      WHERE ea.file_path = objects.name
        AND (
          public.is_admin()
          OR (
            ea.entity_type = 'lead'
            AND EXISTS (
              SELECT 1 FROM public.leads l
              WHERE l.id = ea.entity_id
                AND (l.assigned_to = public.get_current_user_email() OR l.created_by = public.get_current_user_email())
            )
          )
          OR (
            ea.entity_type = 'customer'
            AND EXISTS (
              SELECT 1 FROM public.customers c
              WHERE c.id = ea.entity_id
                AND (c.assigned_to = public.get_current_user_email() OR c.created_by = public.get_current_user_email())
            )
          )
          OR (
            ea.entity_type = 'task'
            AND EXISTS (
              SELECT 1 FROM public.tasks t
              WHERE t.id = ea.entity_id
                AND (t.assigned_to = public.get_current_user_email() OR t.created_by = public.get_current_user_email())
            )
          )
        )
    )
  )
);
