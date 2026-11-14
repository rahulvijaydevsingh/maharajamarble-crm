-- ============================================================================
-- SQL Acceptance Test Suite for Slice 0 (Migration M0)
-- Verifies: Appendix B Phone Vectors, INVARIANT-04 Guards, Media Path Guards,
-- Table RLS, Table Privileges, Function Privileges, and Behavioral RPCs
-- (wa_match_entities, wa_create_campaign, wa_claim_next, wa_expire_leases,
-- wa_apply_opt_out) inside a self-rolling-back subtransaction.
-- ============================================================================

DO $$
DECLARE
  v_session_id uuid;
  v_create_res jsonb;
  v_campaign_id uuid;
  v_claim1 jsonb;
  v_claim2 jsonb;
  v_expired_count integer;
  v_opt_out_res jsonb;
  v_report_res jsonb;
BEGIN
  -- 1. Appendix B Phone Vector Assertions (14 vectors)
  ASSERT public.normalize_phone_10('9876543210') = '9876543210', 'Vector 1 failed';
  ASSERT public.normalize_phone_10('+91 98765 43210') = '9876543210', 'Vector 2 failed';
  ASSERT public.normalize_phone_10('919876543210') = '9876543210', 'Vector 3 failed';
  ASSERT public.normalize_phone_10('09876543210') = '9876543210', 'Vector 4 failed';
  ASSERT public.normalize_phone_10('0091-9876543210') = '9876543210', 'Vector 5 failed';
  ASSERT public.normalize_phone_10('98765-43210') = '9876543210', 'Vector 6 failed';
  ASSERT public.normalize_phone_10('(+91) 98765 43210') = '9876543210', 'Vector 7 failed';
  ASSERT public.normalize_phone_10('ph: 9876543210') = '9876543210', 'Vector 8 failed';
  ASSERT public.normalize_phone_10('1234567890') IS NULL, 'Vector 9 failed';
  ASSERT public.normalize_phone_10('987654321') IS NULL, 'Vector 10 failed';
  ASSERT public.normalize_phone_10('91987654321') IS NULL, 'Vector 11 failed';
  ASSERT public.normalize_phone_10('+1 415 555 2671') IS NULL, 'Vector 12 failed';
  ASSERT public.normalize_phone_10('01722345678') IS NULL, 'Vector 13 failed';
  ASSERT public.normalize_phone_10('') IS NULL, 'Vector 14 failed';

  -- 2. INVARIANT-04 & Media Path Guard Assertions
  ASSERT public.wa_is_valid_attribution_name('Nipun Tantia') = true, 'Valid full name rejected';
  ASSERT public.wa_is_valid_attribution_name('System Auto-Reply') = true, 'Sentinel rejected';
  ASSERT public.wa_is_valid_attribution_name('00000000-0000-0000-0000-000000000000') = false, 'UUID was not rejected';
  ASSERT public.wa_is_valid_attribution_name('staff@maharajamarble.com') = false, 'Email was not rejected';
  ASSERT public.wa_is_valid_media_ref('{"path":"whatsapp-staging/u1/doc.pdf"}'::jsonb) = true, 'Valid staging path rejected';
  ASSERT public.wa_is_valid_media_ref('{"path":"whatsapp-library/cat.pdf"}'::jsonb) = true, 'Valid library path rejected';
  ASSERT public.wa_is_valid_media_ref('{"path":"customer-secure/secret.pdf"}'::jsonb) = false, 'Invalid bucket path was not rejected';

  -- 3. RLS Enabled Check across all 13 tables
  ASSERT (
    SELECT count(*) = 13
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN (
         'whatsapp_settings', 'whatsapp_sessions', 'whatsapp_user_permissions',
         'whatsapp_campaigns', 'whatsapp_queue', 'whatsapp_messages',
         'whatsapp_suppressions', 'whatsapp_inbound_pool', 'whatsapp_auto_replies',
         'whatsapp_auto_reply_log', 'whatsapp_library_items',
         'whatsapp_worker_instances', 'whatsapp_events'
       )
       AND rowsecurity = true
  ), 'RLS is not enabled on all 13 whatsapp_* tables';

  -- 4. Table Privilege Denial Check
  ASSERT NOT has_table_privilege('anon', 'public.whatsapp_settings', 'SELECT'), 'anon should not read whatsapp_settings';
  ASSERT NOT has_table_privilege('anon', 'public.whatsapp_queue', 'SELECT'), 'anon should not read whatsapp_queue';
  ASSERT NOT has_table_privilege('authenticated', 'public.whatsapp_queue', 'INSERT'), 'authenticated should not have direct INSERT on whatsapp_queue';
  ASSERT NOT has_table_privilege('authenticated', 'public.whatsapp_sessions', 'UPDATE'), 'authenticated should not have direct UPDATE on whatsapp_sessions';

  -- 5. Function Execution Privilege Assertions
  ASSERT NOT has_function_privilege('anon', 'public.normalize_phone_10(text)', 'EXECUTE'), 'anon must not execute normalize_phone_10';
  ASSERT NOT has_function_privilege('anon', 'public.wa_slot_status()', 'EXECUTE'), 'anon must not execute wa_slot_status';
  ASSERT NOT has_function_privilege('anon', 'public.wa_match_entities(text)', 'EXECUTE'), 'anon must not execute wa_match_entities';
  ASSERT NOT has_function_privilege('anon', 'public.wa_claim_next(text, uuid)', 'EXECUTE'), 'anon must not execute wa_claim_next';

  ASSERT NOT has_function_privilege('authenticated', 'public.wa_phone_suppressed(text)', 'EXECUTE'), 'authenticated must not execute wa_phone_suppressed directly';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_match_entities(text)', 'EXECUTE'), 'authenticated must not execute wa_match_entities';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_create_campaign(jsonb)', 'EXECUTE'), 'authenticated must not execute wa_create_campaign directly';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_expire_leases()', 'EXECUTE'), 'authenticated must not execute wa_expire_leases';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_claim_next(text, uuid)', 'EXECUTE'), 'authenticated must not execute wa_claim_next';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_report_result(uuid, uuid, jsonb)', 'EXECUTE'), 'authenticated must not execute wa_report_result';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_apply_opt_out(text, uuid)', 'EXECUTE'), 'authenticated must not execute wa_apply_opt_out';
  ASSERT NOT has_function_privilege('authenticated', 'public.wa_reconcile_flags()', 'EXECUTE'), 'authenticated must not execute wa_reconcile_flags';

  ASSERT has_function_privilege('authenticated', 'public.wa_slot_status()', 'EXECUTE'), 'authenticated should execute wa_slot_status';
  ASSERT has_function_privilege('authenticated', 'public.wa_cancel_item(uuid)', 'EXECUTE'), 'authenticated should execute wa_cancel_item';
  ASSERT has_function_privilege('authenticated', 'public.wa_cancel_campaign(uuid, text)', 'EXECUTE'), 'authenticated should execute wa_cancel_campaign';
  ASSERT has_function_privilege('service_role', 'public.wa_claim_next(text, uuid)', 'EXECUTE'), 'service_role should execute wa_claim_next';
  ASSERT has_function_privilege('service_role', 'public.wa_create_campaign(jsonb)', 'EXECUTE'), 'service_role should execute wa_create_campaign';

  -- 6. Behavioral RPC Verification inside a self-rolling-back subtransaction
  BEGIN
    -- 6a. Execute wa_match_entities (verifying no ambiguity error on UNION ALL)
    PERFORM * FROM public.wa_match_entities('9876543210');

    -- 6b. Enable module in subtransaction and create a connected test session
    UPDATE public.whatsapp_settings
       SET module_enabled = true,
           kill_switch = false,
           main_business_hours_only = false;

    INSERT INTO public.whatsapp_sessions (
      slot, session_key, label, status, desired_state, created_by
    ) VALUES (
      'main', 'main', 'Test Main Session', 'connected', 'connected', 'Nipun Tantia'
    ) RETURNING id INTO v_session_id;

    UPDATE public.whatsapp_settings SET main_session_id = v_session_id;

    -- 6c. Create a single campaign via wa_create_campaign (using auto_reply source so no auth.users dependency is required)
    v_create_res := public.wa_create_campaign(
      jsonb_build_object(
        'request_id', 'test-req-001',
        'kind', 'single',
        'slot', 'main',
        'source', 'auto_reply',
        'requested_by', 'System Auto-Reply',
        'rows', jsonb_build_array(
          jsonb_build_object(
            'recipient_phone', '+91 98765 43210',
            'recipient_name', 'Test Contact',
            'message_type', 'text',
            'rendered_body', 'Hello from test suite'
          )
        )
      )
    );
    v_campaign_id := (v_create_res->>'campaign_id')::uuid;
    ASSERT (v_create_res->>'queued')::integer = 1, 'Expected 1 queued row';

    -- 6d. Verify paused campaign is ignored by wa_claim_next
    UPDATE public.whatsapp_campaigns SET status = 'paused' WHERE id = v_campaign_id;
    v_claim1 := public.wa_claim_next('worker-test', v_session_id);
    ASSERT v_claim1 IS NULL, 'wa_claim_next must not claim rows from a paused campaign';

    -- 6e. Resume campaign and claim row
    UPDATE public.whatsapp_campaigns SET status = 'running' WHERE id = v_campaign_id;
    v_claim1 := public.wa_claim_next('worker-test', v_session_id);
    ASSERT v_claim1 IS NOT NULL, 'wa_claim_next should claim the queued row';
    v_claim2 := public.wa_claim_next('worker-test', v_session_id);
    ASSERT v_claim2 IS NULL, 'Second claim must return NULL';

    -- 6f. Verify lease expiry moves sending row to needs_review
    UPDATE public.whatsapp_queue
       SET lease_expires_at = now() - interval '5 seconds'
     WHERE id = (v_claim1->>'queue_id')::uuid;
    v_expired_count := public.wa_expire_leases();
    ASSERT v_expired_count = 1, 'wa_expire_leases should expire 1 row to needs_review';
    ASSERT (SELECT status FROM public.whatsapp_queue WHERE id = (v_claim1->>'queue_id')::uuid) = 'needs_review',
      'Expired row must transition to needs_review';

    -- 6g. Verify wa_apply_opt_out suppresses phone10
    v_opt_out_res := public.wa_apply_opt_out('9876543210', NULL);
    ASSERT public.wa_phone_suppressed('9876543210') = true, 'Phone should be suppressed after wa_apply_opt_out';

    -- Roll back all behavioral test rows cleanly
    RAISE EXCEPTION 'ROLLBACK_BEHAVIORAL_TESTS' USING ERRCODE = 'P9999';
  EXCEPTION
    WHEN SQLSTATE 'P9999' THEN
      NULL;
  END;

  RAISE NOTICE 'ALL SLICE 0 SQL, PRIVILEGE & BEHAVIORAL ASSERTIONS PASSED SUCCESSFULLY.';
END $$;
