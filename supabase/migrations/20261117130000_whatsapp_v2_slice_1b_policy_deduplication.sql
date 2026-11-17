-- Remove redundant policies introduced during Slice 1B rollout.
-- Slice 0 already defines whatsapp_library_items_admin_write and
-- whatsapp_library_items_select for library-row permissions.
BEGIN;

DROP POLICY IF EXISTS whatsapp_library_authenticated_select
  ON public.whatsapp_library_items;
DROP POLICY IF EXISTS whatsapp_library_admin_insert
  ON public.whatsapp_library_items;
DROP POLICY IF EXISTS whatsapp_library_admin_update
  ON public.whatsapp_library_items;
DROP POLICY IF EXISTS whatsapp_library_admin_delete
  ON public.whatsapp_library_items;

DROP POLICY IF EXISTS whatsapp_library_authenticated_select ON storage.objects;
DROP POLICY IF EXISTS whatsapp_staging_authenticated_select ON storage.objects;

-- One SELECT policy handles both private user staging and active library items.
CREATE POLICY whatsapp_staging_authenticated_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'crm-attachments'
    AND (
      (
        (storage.foldername(name))[1] = 'whatsapp-staging'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR (
        (storage.foldername(name))[1] = 'whatsapp-library'
        AND EXISTS (
          SELECT 1
            FROM public.whatsapp_library_items AS li
           WHERE li.path = objects.name
             AND (li.active = true OR public.is_admin())
        )
      )
      OR (
        public.is_admin()
        AND (storage.foldername(name))[1] IN ('whatsapp-staging', 'whatsapp-library')
      )
    )
  );

COMMIT;
