CREATE OR REPLACE FUNCTION public.claim_backup_table(
  p_job_id uuid,
  p_table_name text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_done integer;
  v_total integer;
BEGIN
  UPDATE public.backup_jobs
  SET tables_completed = CASE
        WHEN p_table_name = ANY(tables_completed) THEN tables_completed
        ELSE array_append(tables_completed, p_table_name)
      END
  WHERE id = p_job_id;

  SELECT array_length(tables_completed, 1), array_length(tables_to_export, 1)
  INTO v_done, v_total
  FROM public.backup_jobs WHERE id = p_job_id;

  UPDATE public.backup_jobs
  SET progress = jsonb_build_object('tables_done', v_done, 'tables_total', v_total, 'current_table', p_table_name),
      updated_at = now()
  WHERE id = p_job_id;

  RETURN v_done;
END;
$$;
