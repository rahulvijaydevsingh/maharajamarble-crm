-- ============================================================================
-- SQL Acceptance Test Suite for Slice 0 (Migration M0)
-- Verifies: Appendix B Phone Vectors, INVARIANT-04 Guards, Table RLS,
-- Table Privileges, and Function Execution Privilege Lockdown.
-- ============================================================================

DO $$
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

  -- 2. INVARIANT-04 Attribution Guard Assertions (S5)
  ASSERT public.wa_is_valid_attribution_name('Nipun Tantia') = true, 'Valid full name rejected';
  ASSERT public.wa_is_valid_attribution_name('System Auto-Reply') = true, 'Sentinel rejected';
  ASSERT public.wa_is_valid_attribution_name('00000000-0000-0000-0000-000000000000') = false, 'UUID was not rejected';
  ASSERT public.wa_is_valid_attribution_name('staff@maharajamarble.com') = false, 'Email was not rejected';

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

  -- 5. Function Execution Privilege Assertions (Blocker 1 Verification)
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

  RAISE NOTICE 'ALL SLICE 0 SQL & FUNCTION PRIVILEGE ASSERTIONS PASSED SUCCESSFULLY.';
END $$;
