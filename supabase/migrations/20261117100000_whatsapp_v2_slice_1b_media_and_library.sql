-- ============================================================================
-- WhatsApp Slice 1B: media staging, reusable library, and safe purge controls
-- Aligned with the M0 / Slice 1A schema:
-- whatsapp_library_items uses kind/bucket/path/filename/mime/size_bytes/active.
-- ============================================================================
BEGIN;

ALTER TABLE public.whatsapp_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_library_items ADD COLUMN IF NOT EXISTS description text;

-- Storage rules are scoped to crm-attachments and the Slice 1B folders.
DROP POLICY IF EXISTS whatsapp_staging_authenticated_insert ON storage.objects;
CREATE POLICY whatsapp_staging_authenticated_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'crm-attachments'
    AND (storage.foldername(name))[1] = 'whatsapp-staging'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND position('..' IN name) = 0
    AND position('//' IN name) = 0
  );

DROP POLICY IF EXISTS whatsapp_staging_authenticated_select ON storage.objects;
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

DROP POLICY IF EXISTS whatsapp_staging_authenticated_delete ON storage.objects;
CREATE POLICY whatsapp_staging_authenticated_delete
  ON storage.objects
  FOR DELETE
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
        AND public.is_admin()
      )
    )
  );

DROP POLICY IF EXISTS whatsapp_library_admin_insert ON storage.objects;
CREATE POLICY whatsapp_library_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'crm-attachments'
    AND (storage.foldername(name))[1] = 'whatsapp-library'
    AND public.is_admin()
    AND position('..' IN name) = 0
    AND position('//' IN name) = 0
  );

DROP POLICY IF EXISTS whatsapp_library_admin_update ON storage.objects;
CREATE POLICY whatsapp_library_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'crm-attachments'
    AND (storage.foldername(name))[1] = 'whatsapp-library'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'crm-attachments'
    AND (storage.foldername(name))[1] = 'whatsapp-library'
    AND public.is_admin()
  );

-- Raise the default library allowance to the Slice 1B limit, preserving overrides.
ALTER TABLE public.whatsapp_settings
  ALTER COLUMN library_quota_mb SET DEFAULT 350;
UPDATE public.whatsapp_settings
   SET library_quota_mb = 350
 WHERE library_quota_mb = 250;

CREATE OR REPLACE FUNCTION public.wa_library_list(
  p_kind text DEFAULT NULL,
  p_active_only boolean DEFAULT true
)
RETURNS SETOF public.whatsapp_library_items
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT li.*
    FROM public.whatsapp_library_items AS li
   WHERE (p_kind IS NULL OR li.kind = p_kind)
     AND (NOT COALESCE(p_active_only, true) OR li.active = true)
     AND (li.active = true OR public.is_admin())
   ORDER BY li.created_at DESC, li.id;
$$;

CREATE OR REPLACE FUNCTION public.wa_library_set_active(
  p_item_id uuid,
  p_active boolean
)
RETURNS public.whatsapp_library_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_row public.whatsapp_library_items;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only admins can modify WhatsApp library items'
      USING ERRCODE = '42501';
  END IF;

  v_actor := public.wa_current_user_name();
  IF v_actor IS NULL OR btrim(v_actor) = '' THEN
    RAISE EXCEPTION 'PROFILE_NAME_MISSING: Staff full_name is required'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.whatsapp_library_items
     SET active = COALESCE(p_active, true),
         updated_at = now()
   WHERE id = p_item_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Library item % does not exist', p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.whatsapp_events (level, code, detail)
  VALUES (
    'info',
    'LIBRARY_ITEM_TOGGLED',
    jsonb_build_object(
      'item_id', v_row.id,
      'title', v_row.title,
      'active', v_row.active,
      'actor_name', v_actor
    )
  );

  RETURN v_row;
END;
$$;

-- Deletes library metadata only; callers remove the physical object via Storage API.
CREATE OR REPLACE FUNCTION public.wa_library_delete(
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_row public.whatsapp_library_items;
  v_active_refs bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only admins can delete WhatsApp library items'
      USING ERRCODE = '42501';
  END IF;

  v_actor := public.wa_current_user_name();
  IF v_actor IS NULL OR btrim(v_actor) = '' THEN
    RAISE EXCEPTION 'PROFILE_NAME_MISSING: Staff full_name is required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_row
    FROM public.whatsapp_library_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Library item % does not exist', p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)
    INTO v_active_refs
    FROM public.whatsapp_queue AS q
   WHERE (
      q.media_ref ->> 'path' = v_row.path
      OR q.media_ref ->> 'library_item_id' = v_row.id::text
   )
     AND q.status NOT IN (
       'sent', 'failed', 'cancelled', 'skipped_opt_out', 'skipped_invalid'
     );

  IF v_active_refs > 0 THEN
    RAISE EXCEPTION
      'LIBRARY_ITEM_IN_USE: % active queue row(s) still reference this library item',
      v_active_refs
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.whatsapp_library_items
   WHERE id = p_item_id;

  INSERT INTO public.whatsapp_events (level, code, detail)
  VALUES (
    'info',
    'LIBRARY_ITEM_DELETED',
    jsonb_build_object(
      'item_id', v_row.id,
      'title', v_row.title,
      'storage_path', v_row.path,
      'byte_size', v_row.size_bytes,
      'actor_name', v_actor
    )
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'storage_bucket', v_row.bucket,
    'storage_path', v_row.path,
    'title', v_row.title
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_can_purge_staging_path(
  p_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_path IS NOT NULL
    AND p_path LIKE 'whatsapp-staging/%'
    AND position('..' IN p_path) = 0
    AND position('//' IN p_path) = 0
    AND position(chr(92) IN p_path) = 0
    AND NOT EXISTS (
      SELECT 1
        FROM public.whatsapp_queue AS q
       WHERE q.media_ref ->> 'path' = p_path
         AND q.status NOT IN (
           'sent', 'failed', 'cancelled', 'skipped_opt_out', 'skipped_invalid'
         )
    );
$$;

CREATE INDEX IF NOT EXISTS whatsapp_queue_media_ref_path_idx
  ON public.whatsapp_queue ((media_ref ->> 'path'))
  WHERE media_ref IS NOT NULL;

REVOKE ALL ON FUNCTION public.wa_library_list(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_library_list(text, boolean)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_library_set_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_library_set_active(uuid, boolean)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_library_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_library_delete(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_can_purge_staging_path(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_can_purge_staging_path(text)
  TO service_role;

COMMENT ON FUNCTION public.wa_can_purge_staging_path(text) IS
  'Service-role-only staging purge guard; callers must delete objects through the Supabase Storage API.';
COMMENT ON FUNCTION public.wa_library_delete(uuid) IS
  'Deletes library metadata only; storage objects are removed separately through the Supabase Storage API.';

COMMIT;
