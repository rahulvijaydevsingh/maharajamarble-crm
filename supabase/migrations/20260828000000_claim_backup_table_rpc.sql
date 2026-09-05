CREATE OR REPLACE FUNCTION public.claim_backup_table(
  p_job_id uuid,
  p_table_name text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_done integer;
BEGIN
  UPDATE public.backup_jobs
  SET tables_completed = CASE
        WHEN p_table_name = ANY(tables_completed) THEN tables_completed
        ELSE array_append(tables_completed, p_table_name)
      END,
      progress = jsonb_build_object(
        'tables_done', cardinality(CASE
          WHEN p_table_name = ANY(tables_completed) THEN tables_completed
          ELSE array_append(tables_completed, p_table_name)
        END),
        'tables_total', coalesce(cardinality(tables_to_export), 0),
        'current_table', p_table_name
      ),
      updated_at = now()
  WHERE id = p_job_id
  RETURNING cardinality(tables_completed) INTO v_done;

  RETURN v_done;
END;
$$;
