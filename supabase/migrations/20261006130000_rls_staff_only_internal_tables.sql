-- 社内用の表を、ログインしたお客様から見えない・触れないようにする（2026-10-06 の権限調査で発覚）。
-- これまでは「自分の組織のデータなら可」という決まりに、お客様（組織が結び付いた利用者）も当てはまり、
-- 日々のメモ・スタッフのシフト提出・給与設定の履歴などがお客様から読めた。作者の情報・募集停止枠は誰でも書き換えられた。
-- 今ある決まりはそのままにし、「スタッフ・管理者であること」を必ず満たす追加の制限（RESTRICTIVE）をかぶせる。
-- サーバー（service_role）と SECURITY DEFINER の関数は影響を受けない。
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_memos','shift_submissions','shift_button_states','shift_notifications','salary_settings_history',
    'performance_cancellation_logs','schedule_blocked_slot_logs','gm_availability_responses','performance_kits','inventory_consistency_logs',
    'external_performance_reports','miscellaneous_transactions','email_logs','staff_checkins'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE NOTICE 'skip missing table %', t; CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS staff_only_restrict ON public.%I', t);
    EXECUTE format('CREATE POLICY staff_only_restrict ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin())', t);
  END LOOP;
END $$;

-- 作者の情報: 管理者だけ（サーバーの API は service_role で読み書きする）
DROP POLICY IF EXISTS admin_only_restrict ON public.authors;
CREATE POLICY admin_only_restrict ON public.authors AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 募集停止枠: 読むのはこれまでどおり。追加・変更・削除はスタッフ・管理者だけ
DROP POLICY IF EXISTS staff_write_restrict_insert ON public.schedule_blocked_slots;
DROP POLICY IF EXISTS staff_write_restrict_update ON public.schedule_blocked_slots;
DROP POLICY IF EXISTS staff_write_restrict_delete ON public.schedule_blocked_slots;
CREATE POLICY staff_write_restrict_insert ON public.schedule_blocked_slots AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (public.is_staff_or_admin());
CREATE POLICY staff_write_restrict_update ON public.schedule_blocked_slots AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());
CREATE POLICY staff_write_restrict_delete ON public.schedule_blocked_slots AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (public.is_staff_or_admin());
