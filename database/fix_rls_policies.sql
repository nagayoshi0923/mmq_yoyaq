-- RLSポリシーの修正スクリプト
-- 無限再帰エラーを解決

-- 既存のポリシーを削除
DROP POLICY IF EXISTS stores_policy ON stores;
DROP POLICY IF EXISTS scenarios_policy ON scenarios;
DROP POLICY IF EXISTS staff_policy ON staff;
DROP POLICY IF EXISTS users_policy ON users;
DROP POLICY IF EXISTS customers_policy ON customers;

-- 修正されたポリシーを作成

-- 1. usersテーブル - 無限再帰を避けるため、auth.uid()のみを使用
CREATE POLICY users_policy ON users FOR ALL USING (
  auth.uid() = id
);

-- 2. storesテーブル - 認証されたユーザーは全員アクセス可能（開発用）
CREATE POLICY stores_policy ON stores FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 3. scenariosテーブル - 認証されたユーザーは全員アクセス可能（開発用）
CREATE POLICY scenarios_policy ON scenarios FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 4. staffテーブル - 認証されたユーザーは全員アクセス可能（開発用）
CREATE POLICY staff_policy ON staff FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 5. customersテーブル - 自分のデータまたは認証されたユーザー
CREATE POLICY customers_policy ON customers FOR ALL USING (
  user_id = auth.uid() OR auth.uid() IS NOT NULL
);

-- 6. schedule_eventsテーブル - 認証されたユーザーは全員アクセス可能
CREATE POLICY schedule_events_policy ON schedule_events FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 7. reservationsテーブル - 認証されたユーザーは全員アクセス可能
CREATE POLICY reservations_policy ON reservations FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 8. performance_kitsテーブル - 認証されたユーザーは全員アクセス可能
CREATE POLICY performance_kits_policy ON performance_kits FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 9. staff_scenario_assignmentsテーブル - 認証されたユーザーは全員アクセス可能
CREATE POLICY staff_scenario_assignments_policy ON staff_scenario_assignments FOR ALL USING (
  auth.uid() IS NOT NULL
);

-- 完了メッセージ
SELECT 'RLSポリシー修正完了！' as message;
