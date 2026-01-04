-- =============================================================================
-- RLSポリシー厳格化: 移行期間の緩和措置を削除
-- =============================================================================
-- 
-- 【目的】
-- マルチテナント環境で organization_id によるデータ分離を確実に行う。
-- 「移行期間中」の緩和措置を削除し、厳格なRLSポリシーを適用。
-- 
-- 【設計方針】
-- 1. スタッフ（組織に所属）→ 自組織のデータのみアクセス可能
-- 2. 顧客（組織に未所属）→ 自分のデータ + 公開データのみ
-- 3. 匿名ユーザー → 公開データのみ（予約サイト用）
-- 
-- 【適用テーブル】
-- organization_id を持つ全てのテーブル
-- 
-- 【実行前の確認事項】
-- 1. 全てのデータに organization_id が設定されていること
-- 2. バックアップを取得していること
-- 
-- =============================================================================

-- 現在のユーザーの organization_id を取得する関数（再作成）
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- staff テーブルから organization_id を取得
  SELECT organization_id INTO org_id
  FROM staff
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ユーザーが管理者かどうかを判定する関数
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- 1. stores（店舗情報）
-- =============================================================================
DROP POLICY IF EXISTS stores_org_policy ON stores;
DROP POLICY IF EXISTS stores_select_org_or_anon ON stores;
DROP POLICY IF EXISTS stores_public_read ON stores;
DROP POLICY IF EXISTS stores_strict ON stores;

-- スタッフ: 自組織のみ、匿名: アクティブ店舗のみ
CREATE POLICY stores_strict ON stores FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      -- スタッフ: 自組織のデータのみ
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 匿名/顧客: アクティブな店舗のみ（予約サイト用）
      status = 'active'
  END
);

-- =============================================================================
-- 2. scenarios（シナリオ情報）
-- =============================================================================
DROP POLICY IF EXISTS scenarios_org_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_modify_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_update_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_delete_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_select_org_or_anon ON scenarios;
DROP POLICY IF EXISTS scenarios_public_read ON scenarios;
DROP POLICY IF EXISTS scenarios_strict_select ON scenarios;
DROP POLICY IF EXISTS scenarios_strict_modify ON scenarios;

-- SELECT: スタッフ→自組織+共有、匿名→公開のみ
CREATE POLICY scenarios_strict_select ON scenarios FOR SELECT USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_shared = true OR is_org_admin()
    ELSE
      status = 'available'
  END
);

-- INSERT/UPDATE/DELETE: スタッフのみ、自組織のみ
CREATE POLICY scenarios_strict_modify ON scenarios FOR ALL USING (
  get_user_organization_id() IS NOT NULL AND (
    organization_id = get_user_organization_id() OR is_org_admin()
  )
);

-- =============================================================================
-- 3. schedule_events（スケジュールイベント）
-- =============================================================================
DROP POLICY IF EXISTS schedule_events_org_policy ON schedule_events;
DROP POLICY IF EXISTS schedule_events_select_org_or_anon ON schedule_events;
DROP POLICY IF EXISTS schedule_events_public_read ON schedule_events;
DROP POLICY IF EXISTS schedule_events_strict ON schedule_events;

CREATE POLICY schedule_events_strict ON schedule_events FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 匿名: キャンセルされていない公開イベントのみ
      is_cancelled = false
  END
);

-- =============================================================================
-- 4. reservations（予約情報）
-- =============================================================================
DROP POLICY IF EXISTS reservations_org_policy ON reservations;
DROP POLICY IF EXISTS reservations_strict ON reservations;

CREATE POLICY reservations_strict ON reservations FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      -- スタッフ: 自組織のデータのみ
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 顧客: 自分の予約のみ（customer_idまたはuser_idで判定）
      EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = reservations.customer_id
        AND c.user_id = auth.uid()
      )
  END
);

-- =============================================================================
-- 5. customers（顧客情報）
-- =============================================================================
DROP POLICY IF EXISTS customers_org_policy ON customers;
DROP POLICY IF EXISTS customers_strict ON customers;

CREATE POLICY customers_strict ON customers FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 顧客: 自分のデータのみ（user_idがNULLでない場合）
      (user_id IS NOT NULL AND user_id = auth.uid())
  END
);

-- =============================================================================
-- 6. staff（スタッフ情報）
-- =============================================================================
DROP POLICY IF EXISTS staff_org_policy ON staff;
DROP POLICY IF EXISTS staff_select_org_or_anon ON staff;
DROP POLICY IF EXISTS staff_strict ON staff;

CREATE POLICY staff_strict ON staff FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 7. staff_scenario_assignments（スタッフ-シナリオ割当）
-- =============================================================================
DROP POLICY IF EXISTS staff_scenario_assignments_policy ON staff_scenario_assignments;
DROP POLICY IF EXISTS staff_scenario_assignments_strict ON staff_scenario_assignments;

CREATE POLICY staff_scenario_assignments_strict ON staff_scenario_assignments FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 8. shift_submissions（シフト提出）
-- =============================================================================
DROP POLICY IF EXISTS shift_submissions_org_policy ON shift_submissions;
DROP POLICY IF EXISTS shift_submissions_strict ON shift_submissions;

CREATE POLICY shift_submissions_strict ON shift_submissions FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 9. scenario_likes（シナリオいいね）
-- =============================================================================
DROP POLICY IF EXISTS scenario_likes_policy ON scenario_likes;
DROP POLICY IF EXISTS scenario_likes_strict ON scenario_likes;

CREATE POLICY scenario_likes_strict ON scenario_likes FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 顧客: 自分のいいねのみ（customer_id経由でuser_idを確認）
      EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = scenario_likes.customer_id
        AND c.user_id = auth.uid()
      )
  END
);

-- =============================================================================
-- 10. gm_availability_responses（GM可否回答）
-- =============================================================================
DROP POLICY IF EXISTS gm_availability_responses_org_policy ON gm_availability_responses;
DROP POLICY IF EXISTS gm_availability_responses_strict ON gm_availability_responses;

CREATE POLICY gm_availability_responses_strict ON gm_availability_responses FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 11. private_booking_requests（貸切リクエスト）
-- =============================================================================
DROP POLICY IF EXISTS private_booking_requests_org_policy ON private_booking_requests;
DROP POLICY IF EXISTS private_booking_requests_strict ON private_booking_requests;

CREATE POLICY private_booking_requests_strict ON private_booking_requests FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 12. miscellaneous_transactions（雑費取引）
-- =============================================================================
DROP POLICY IF EXISTS miscellaneous_transactions_org_policy ON miscellaneous_transactions;
DROP POLICY IF EXISTS miscellaneous_transactions_strict ON miscellaneous_transactions;

CREATE POLICY miscellaneous_transactions_strict ON miscellaneous_transactions FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 13. external_sales（外部売上）
-- =============================================================================
DROP POLICY IF EXISTS external_sales_policy ON external_sales;
DROP POLICY IF EXISTS external_sales_strict ON external_sales;

CREATE POLICY external_sales_strict ON external_sales FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 14. external_performance_reports（外部公演報告）
-- 注意: organization_id が NULL の場合がある（外部からの報告）
-- =============================================================================
DROP POLICY IF EXISTS external_performance_reports_policy ON external_performance_reports;
DROP POLICY IF EXISTS external_performance_reports_strict ON external_performance_reports;

CREATE POLICY external_performance_reports_strict ON external_performance_reports FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR organization_id IS NULL OR is_org_admin()
    ELSE
      -- 匿名: 自分が報告したもののみ（reporter_emailで判定）
      true  -- 外部報告フォームからの投稿を許可
  END
);

-- =============================================================================
-- 15. daily_memos（日次メモ）
-- =============================================================================
DROP POLICY IF EXISTS daily_memos_policy ON daily_memos;
DROP POLICY IF EXISTS daily_memos_strict ON daily_memos;

CREATE POLICY daily_memos_strict ON daily_memos FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 16-25. 各種設定テーブル
-- =============================================================================

-- global_settings
DROP POLICY IF EXISTS global_settings_org_policy ON global_settings;
DROP POLICY IF EXISTS global_settings_strict ON global_settings;
CREATE POLICY global_settings_strict ON global_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- organization_settings
DROP POLICY IF EXISTS organization_settings_policy ON organization_settings;
DROP POLICY IF EXISTS organization_settings_strict ON organization_settings;
CREATE POLICY organization_settings_strict ON organization_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- business_hours_settings
DROP POLICY IF EXISTS business_hours_settings_policy ON business_hours_settings;
DROP POLICY IF EXISTS business_hours_settings_strict ON business_hours_settings;
CREATE POLICY business_hours_settings_strict ON business_hours_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- notification_settings
DROP POLICY IF EXISTS notification_settings_policy ON notification_settings;
DROP POLICY IF EXISTS notification_settings_strict ON notification_settings;
CREATE POLICY notification_settings_strict ON notification_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- reservation_settings
DROP POLICY IF EXISTS reservation_settings_policy ON reservation_settings;
DROP POLICY IF EXISTS reservation_settings_strict ON reservation_settings;
CREATE POLICY reservation_settings_strict ON reservation_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- booking_notices
DROP POLICY IF EXISTS booking_notices_policy ON booking_notices;
DROP POLICY IF EXISTS booking_notices_strict ON booking_notices;
CREATE POLICY booking_notices_strict ON booking_notices FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 予約サイト: 該当組織のお知らせを表示
      true
  END
);

-- customer_settings
DROP POLICY IF EXISTS customer_settings_policy ON customer_settings;
DROP POLICY IF EXISTS customer_settings_strict ON customer_settings;
CREATE POLICY customer_settings_strict ON customer_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- email_settings
DROP POLICY IF EXISTS email_settings_policy ON email_settings;
DROP POLICY IF EXISTS email_settings_strict ON email_settings;
CREATE POLICY email_settings_strict ON email_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- pricing_settings
DROP POLICY IF EXISTS pricing_settings_policy ON pricing_settings;
DROP POLICY IF EXISTS pricing_settings_strict ON pricing_settings;
CREATE POLICY pricing_settings_strict ON pricing_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- staff_settings
DROP POLICY IF EXISTS staff_settings_policy ON staff_settings;
DROP POLICY IF EXISTS staff_settings_strict ON staff_settings;
CREATE POLICY staff_settings_strict ON staff_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- system_settings
DROP POLICY IF EXISTS system_settings_policy ON system_settings;
DROP POLICY IF EXISTS system_settings_strict ON system_settings;
CREATE POLICY system_settings_strict ON system_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- sales_report_settings
DROP POLICY IF EXISTS sales_report_settings_policy ON sales_report_settings;
DROP POLICY IF EXISTS sales_report_settings_strict ON sales_report_settings;
CREATE POLICY sales_report_settings_strict ON sales_report_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- performance_schedule_settings
DROP POLICY IF EXISTS performance_schedule_settings_policy ON performance_schedule_settings;
DROP POLICY IF EXISTS performance_schedule_settings_strict ON performance_schedule_settings;
CREATE POLICY performance_schedule_settings_strict ON performance_schedule_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- data_management_settings
DROP POLICY IF EXISTS data_management_settings_policy ON data_management_settings;
DROP POLICY IF EXISTS data_management_settings_strict ON data_management_settings;
CREATE POLICY data_management_settings_strict ON data_management_settings FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- salary_settings_history
DROP POLICY IF EXISTS salary_settings_history_policy ON salary_settings_history;
DROP POLICY IF EXISTS salary_settings_history_strict ON salary_settings_history;
CREATE POLICY salary_settings_history_strict ON salary_settings_history FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 26. organization_invitations（組織招待）
-- =============================================================================
DROP POLICY IF EXISTS organization_invitations_policy ON organization_invitations;
DROP POLICY IF EXISTS organization_invitations_strict ON organization_invitations;

CREATE POLICY organization_invitations_strict ON organization_invitations FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 27. performance_kits（公演キット）
-- =============================================================================
DROP POLICY IF EXISTS performance_kits_org_policy ON performance_kits;
DROP POLICY IF EXISTS performance_kits_strict ON performance_kits;

CREATE POLICY performance_kits_strict ON performance_kits FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- =============================================================================
-- 確認コメント
-- =============================================================================
COMMENT ON FUNCTION get_user_organization_id() IS 
  '現在のユーザーの organization_id を取得。NULL = 組織に未所属（顧客/匿名）';
COMMENT ON FUNCTION is_org_admin() IS 
  '現在のユーザーが管理者かどうかを判定';

-- =============================================================================
-- 適用確認クエリ
-- =============================================================================
-- SELECT get_user_organization_id();
-- SELECT is_org_admin();
-- SELECT * FROM stores LIMIT 1;  -- RLSが適用されているか確認


