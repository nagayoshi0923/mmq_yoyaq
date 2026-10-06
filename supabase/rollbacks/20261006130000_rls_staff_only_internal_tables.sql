-- rollback: 追加の制限を外す（お客様から社内用の表が見える状態に戻るので、戻すのは不具合で業務が止まった場合だけにする）
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_memos','shift_submissions','shift_button_states','shift_notifications','salary_settings_history',
    'performance_cancellation_logs','schedule_blocked_slot_logs','gm_availability_responses','performance_kits','inventory_consistency_logs',
    'external_performance_reports','miscellaneous_transactions','email_logs','staff_checkins'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('DROP POLICY IF EXISTS staff_only_restrict ON public.%I', t); END IF;
  END LOOP;
END $$;
DROP POLICY IF EXISTS admin_only_restrict ON public.authors;
DROP POLICY IF EXISTS staff_write_restrict_insert ON public.schedule_blocked_slots;
DROP POLICY IF EXISTS staff_write_restrict_update ON public.schedule_blocked_slots;
DROP POLICY IF EXISTS staff_write_restrict_delete ON public.schedule_blocked_slots;
