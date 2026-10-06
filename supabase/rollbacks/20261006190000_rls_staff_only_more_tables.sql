-- rollback: 追加分の制限を外す（お客様から社内用の表が見える状態に戻るので、戻すのは業務が止まった場合だけ）
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservations_history','notification_settings','email_settings','license_report_history',
    'manual_external_performances','manual_internal_performance_overrides'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('DROP POLICY IF EXISTS staff_only_restrict ON public.%I', t); END IF;
  END LOOP;
END $$;
