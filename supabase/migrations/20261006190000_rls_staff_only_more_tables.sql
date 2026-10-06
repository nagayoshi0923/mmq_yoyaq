-- 社内用の表を、ログインしたお客様から見えないようにする（追加分、2026-10-06）。
-- 組織が結び付いたお客様の立場で全表を確かめたところ、予約の変更履歴・通知の設定（Discord の送信先を含む）・メールの設定・
-- ライセンスの報告履歴・外部公演の記録がまだ読めた。お客様の画面からは使っていない。20261006130000 と同じ追加の制限をかける。
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservations_history','notification_settings','email_settings','license_report_history',
    'manual_external_performances','manual_internal_performance_overrides'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE NOTICE 'skip missing table %', t; CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS staff_only_restrict ON public.%I', t);
    EXECUTE format('CREATE POLICY staff_only_restrict ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING ((SELECT public.is_staff_or_admin())) WITH CHECK ((SELECT public.is_staff_or_admin()))', t);
  END LOOP;
END $$;
