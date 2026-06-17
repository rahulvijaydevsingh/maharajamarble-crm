-- Ensure unique constraint for automation tracking to support INSERT-as-lock pattern
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_automation_tracking_rule_entity'
    ) THEN
        -- Check if any other unique constraint exists on these columns to avoid duplicates
        IF NOT EXISTS (
            SELECT 1
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'public.automation_rule_executions_tracking'::regclass
            AND i.indisunique
            AND (SELECT count(*) FROM unnest(i.indkey)) = 2
            AND a.attname IN ('rule_id', 'entity_id')
        ) THEN
            ALTER TABLE public.automation_rule_executions_tracking
            ADD CONSTRAINT uq_automation_tracking_rule_entity
            UNIQUE (rule_id, entity_id);
        END IF;
    END IF;
END $$;
