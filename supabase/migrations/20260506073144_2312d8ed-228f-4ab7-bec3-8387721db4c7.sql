
CREATE OR REPLACE FUNCTION public.snooze_task(
  p_task_id uuid,
  p_snoozed_until timestamptz,
  p_due_date date,
  p_due_time text,
  p_hours_added numeric,
  p_user_id uuid,
  p_user_name text,
  p_lead_id uuid DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id uuid DEFAULT NULL,
  p_task_title text DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_original_due_date date;
  v_original_due_time text;
  v_title text;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task % not found', p_task_id;
  END IF;

  v_original_due_date := v_task.due_date;
  v_original_due_time := v_task.due_time;
  v_title := COALESCE(p_task_title, v_task.title);

  -- 1) snooze history
  INSERT INTO public.task_snooze_history (
    task_id, original_due_date, original_due_time, snoozed_until
  ) VALUES (
    p_task_id, v_original_due_date, v_original_due_time, p_snoozed_until
  );

  -- 2) update task
  UPDATE public.tasks
  SET
    due_date = p_due_date,
    due_time = p_due_time,
    snoozed_until = p_snoozed_until,
    updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  -- 3) task_activity_log
  INSERT INTO public.task_activity_log (
    task_id, event_type, user_id, user_name, metadata
  ) VALUES (
    p_task_id,
    'snoozed',
    p_user_id,
    COALESCE(p_user_name, 'System'),
    jsonb_build_object(
      'snoozed_until', p_snoozed_until,
      'hours_added', p_hours_added,
      'original_due_date', v_original_due_date
    )
  );

  -- 4) lead activity_log (only if linked)
  IF p_lead_id IS NOT NULL THEN
    INSERT INTO public.activity_log (
      lead_id, activity_type, activity_category, user_id, user_name,
      title, metadata, related_entity_type, related_entity_id,
      is_manual, is_editable
    ) VALUES (
      p_lead_id,
      'task_snoozed',
      'task',
      p_user_id::text,
      COALESCE(p_user_name, 'System'),
      'Task Snoozed: ' || v_title || ' — until ' || to_char(p_snoozed_until, 'DD Mon YYYY'),
      jsonb_build_object(
        'task_id', p_task_id,
        'snoozed_until', p_snoozed_until,
        'original_due_date', v_original_due_date,
        'hours_added', p_hours_added
      ),
      'task',
      p_task_id,
      false,
      false
    );
  END IF;

  RETURN v_task;
END;
$$;
