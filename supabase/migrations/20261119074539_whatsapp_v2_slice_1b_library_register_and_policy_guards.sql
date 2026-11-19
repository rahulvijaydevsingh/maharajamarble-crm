-- ============================================================================
-- WhatsApp Slice 1B fix-up
-- 1. wa_library_register now takes the description, so the client no longer needs a
--    second direct UPDATE on whatsapp_library_items or a destructive client-side rollback.
--    It also validates title, type, size and SHA-256, and checks the declared size and type
--    against the stored Storage object.
-- 2. The SELECT, DELETE and UPDATE Storage policies for whatsapp-staging and whatsapp-library
--    enforce the same path guards (no double dots, no double slashes) as the INSERT policies.
-- Apply to Preview first, then name this file after the version Preview records.
-- ============================================================================
BEGIN;

-- A new parameter creates a second overload, so the old signature is removed first.
-- Existing callers that omit p_description keep working through the default value.
DROP FUNCTION IF EXISTS public.wa_library_register(text, text, text, text, bigint, text);

CREATE OR REPLACE FUNCTION public.wa_library_register(
  p_path text,
  p_title text,
  p_kind text,
  p_mime text,
  p_size_bytes bigint,
  p_sha256 text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin_name text := public.wa_current_user_name();
  v_settings public.whatsapp_settings%ROWTYPE;
  v_current_bytes bigint := 0;
  v_quota_mb bigint;
  v_new_id uuid;
  v_title text := btrim(COALESCE(p_title, ''));
  v_description text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_mime text := lower(btrim(COALESCE(p_mime, '')));
  v_meta jsonb;
  v_stored_size bigint;
  v_stored_mime text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin required to register library items' USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL
     OR p_path NOT LIKE 'whatsapp-library/%'
     OR position('..' IN p_path) > 0
     OR position('//' IN p_path) > 0
     OR position(chr(92) IN p_path) > 0 THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Path must start with whatsapp-library/ and must not contain traversal sequences' USING ERRCODE = 'P0001';
  END IF;

  IF v_title = '' OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Title is required and must be at most 120 characters' USING ERRCODE = 'P0001';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Description must be at most 500 characters' USING ERRCODE = 'P0001';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('catalogue', 'image', 'document') THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Unsupported library kind' USING ERRCODE = 'P0001';
  END IF;

  IF v_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Unsupported media type' USING ERRCODE = 'P0001';
  END IF;

  IF p_size_bytes IS NULL
     OR p_size_bytes <= 0
     OR p_size_bytes > (CASE WHEN v_mime = 'application/pdf' THEN 16777216 ELSE 5242880 END) THEN
    RAISE EXCEPTION 'MEDIA_INVALID: File size is outside the allowed range' USING ERRCODE = 'P0001';
  END IF;

  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MEDIA_INVALID: SHA-256 must be 64 lowercase hex characters' USING ERRCODE = 'P0001';
  END IF;

  SELECT o.metadata
    INTO v_meta
    FROM storage.objects o
   WHERE o.bucket_id = 'crm-attachments'
     AND o.name = p_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Object does not exist in crm-attachments at %', p_path USING ERRCODE = 'P0001';
  END IF;

  v_stored_size := CASE WHEN (v_meta ->> 'size') ~ '^[0-9]+$' THEN (v_meta ->> 'size')::bigint END;
  v_stored_mime := lower(btrim(split_part(COALESCE(v_meta ->> 'mimetype', ''), ';', 1)));

  IF v_stored_size IS NOT NULL AND v_stored_size <> p_size_bytes THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Declared size does not match the stored object' USING ERRCODE = 'P0001';
  END IF;

  IF v_stored_mime <> '' AND v_stored_mime <> v_mime THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Declared type does not match the stored object' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_settings FROM public.whatsapp_settings LIMIT 1;
  v_quota_mb := COALESCE(v_settings.library_quota_mb, 350)::bigint;

  SELECT COALESCE(sum(size_bytes), 0)::bigint
    INTO v_current_bytes
    FROM public.whatsapp_library_items
   WHERE active = true;

  IF (v_current_bytes + p_size_bytes) > (v_quota_mb * 1024 * 1024) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Library quota of % MB exceeded', v_quota_mb USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.whatsapp_library_items (
    title,
    kind,
    bucket,
    path,
    filename,
    mime,
    size_bytes,
    sha256,
    description,
    active,
    created_by,
    created_by_user_id
  ) VALUES (
    v_title,
    p_kind,
    'crm-attachments',
    p_path,
    regexp_replace(p_path, '^.*/', ''),
    v_mime,
    p_size_bytes,
    p_sha256,
    v_description,
    true,
    v_admin_name,
    v_uid
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.wa_library_register(text, text, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_library_register(text, text, text, text, bigint, text, text) TO authenticated, service_role;

-- Storage policies: add the path guards that only the INSERT policies had.
DROP POLICY IF EXISTS whatsapp_staging_authenticated_select ON storage.objects;
CREATE POLICY whatsapp_staging_authenticated_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'crm-attachments'
    AND position('..' IN name) = 0
    AND position('//' IN name) = 0
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
    AND position('..' IN name) = 0
    AND position('//' IN name) = 0
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

DROP POLICY IF EXISTS whatsapp_library_admin_update ON storage.objects;
CREATE POLICY whatsapp_library_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'crm-attachments'
    AND (storage.foldername(name))[1] = 'whatsapp-library'
    AND position('..' IN name) = 0
    AND position('//' IN name) = 0
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'crm-attachments'
    AND (storage.foldername(name))[1] = 'whatsapp-library'
    AND position('..' IN name) = 0
    AND position('//' IN name) = 0
    AND public.is_admin()
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
