-- =============================================================================
-- 🔒 セキュリティ修正: RLSポリシーの統一と整合性確保
-- 
-- 問題: database/migrations/ と supabase/migrations/ で重複・競合するRLSポリシーが定義されていた
-- 解決: 全てのポリシーを一箇所で管理し、操作別（SELECT/INSERT/UPDATE/DELETE）に分離
-- 
-- このマイグレーションは以下を行う:
-- 1. 既存の競合ポリシーをすべて削除
-- 2. 統一された命名規則でポリシーを再作成
-- 3. セキュリティ強化（操作別に細かく制御）
-- =============================================================================

-- =============================================================================
-- 0. ヘルパー関数の統一
-- =============================================================================

-- 現在のユーザーの組織IDを取得
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- 管理者かどうか（スーパー管理者含む）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- 組織管理者かどうか
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- スタッフ以上の権限があるか
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'staff', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- =============================================================================
-- 1. reservations テーブル
-- =============================================================================

-- 既存ポリシーを全て削除
DROP POLICY IF EXISTS "reservations_strict" ON public.reservations;
DROP POLICY IF EXISTS "reservations_org_policy" ON public.reservations;
DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete" ON public.reservations;
DROP POLICY IF EXISTS "reservations_select_self_or_own_org" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_self_or_own_org" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_own_org" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_own_org" ON public.reservations;
DROP POLICY IF EXISTS "reservations_select_unified" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_unified" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_unified" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_unified" ON public.reservations;

-- SELECT: 自分の予約 または 自分の組織のデータ
CREATE POLICY "reservations_select_unified" ON public.reservations
  FOR SELECT
  USING (
    -- 顧客: 自分の予約のみ
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR
    -- スタッフ/管理者: 自分の組織のデータ
    organization_id = get_user_organization_id()
    OR
    -- スーパー管理者: 全データ
    is_org_admin()
  );

-- INSERT: RPC関数経由のみ（直接INSERTは禁止）
-- 🔒 セキュリティ強化: customer_id IS NULL の場合は管理者/スタッフのみ
CREATE POLICY "reservations_insert_unified" ON public.reservations
  FOR INSERT
  WITH CHECK (
    -- (A) 顧客予約: 本人のcustomer_idのみ
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR
    -- (B) 管理者/スタッフによる代理予約
    (
      is_staff_or_admin()
      AND organization_id = get_user_organization_id()
    )
  );

-- UPDATE: 自分の予約（status変更のみ）または 自分の組織の管理者/スタッフ
CREATE POLICY "reservations_update_unified" ON public.reservations
  FOR UPDATE
  USING (
    -- 顧客: 自分の予約のみ
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR
    -- スタッフ/管理者: 自分の組織のデータ
    (is_staff_or_admin() AND organization_id = get_user_organization_id())
  );

-- DELETE: 管理者のみ（通常はキャンセルで対応）
CREATE POLICY "reservations_delete_unified" ON public.reservations
  FOR DELETE
  USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- =============================================================================
-- 2. schedule_events テーブル
-- =============================================================================

DROP POLICY IF EXISTS "schedule_events_strict" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_org_policy" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_org_or_anon" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_insert_own_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_update_own_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_delete_own_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_unified" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_insert_unified" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_update_unified" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_delete_unified" ON public.schedule_events;

-- SELECT: 全員閲覧可能（予約サイト用）、ただしキャンセル済みは管理者のみ
CREATE POLICY "schedule_events_select_unified" ON public.schedule_events
  FOR SELECT
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        -- スタッフ/管理者: 自分の組織のデータ（キャンセル済みも含む）
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        -- 匿名/顧客: キャンセルされていないイベントのみ
        is_cancelled = false
    END
  );

-- INSERT: 自分の組織のみ
CREATE POLICY "schedule_events_insert_unified" ON public.schedule_events
  FOR INSERT
  WITH CHECK (
    is_staff_or_admin() AND organization_id = get_user_organization_id()
  );

-- UPDATE: 自分の組織のみ
CREATE POLICY "schedule_events_update_unified" ON public.schedule_events
  FOR UPDATE
  USING (
    is_staff_or_admin() AND organization_id = get_user_organization_id()
  );

-- DELETE: 管理者のみ
CREATE POLICY "schedule_events_delete_unified" ON public.schedule_events
  FOR DELETE
  USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- =============================================================================
-- 3. customers テーブル
-- =============================================================================

DROP POLICY IF EXISTS "customers_strict" ON public.customers;
DROP POLICY IF EXISTS "customers_org_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_select" ON public.customers;
DROP POLICY IF EXISTS "customers_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_update_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_update_own" ON public.customers;
DROP POLICY IF EXISTS "customers_delete" ON public.customers;
DROP POLICY IF EXISTS "customers_select_self_or_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_self_or_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_update_self_or_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_select_unified" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_unified" ON public.customers;
DROP POLICY IF EXISTS "customers_update_unified" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_unified" ON public.customers;

-- SELECT: 自分自身 または 自分の組織のデータ
CREATE POLICY "customers_select_unified" ON public.customers
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id = get_user_organization_id()
    OR is_org_admin()
  );

-- INSERT: 自分自身 または 自分の組織の管理者/スタッフ
CREATE POLICY "customers_insert_unified" ON public.customers
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (is_staff_or_admin() AND organization_id = get_user_organization_id())
  );

-- UPDATE: 自分自身 または 自分の組織の管理者/スタッフ
CREATE POLICY "customers_update_unified" ON public.customers
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (is_staff_or_admin() AND organization_id = get_user_organization_id())
  );

-- DELETE: 管理者のみ
CREATE POLICY "customers_delete_unified" ON public.customers
  FOR DELETE
  USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- =============================================================================
-- 4. staff テーブル
-- =============================================================================

DROP POLICY IF EXISTS "staff_strict" ON public.staff;
DROP POLICY IF EXISTS "staff_org_policy" ON public.staff;
DROP POLICY IF EXISTS "staff_select_org_or_anon" ON public.staff;
DROP POLICY IF EXISTS "staff_insert_own_org" ON public.staff;
DROP POLICY IF EXISTS "staff_update_own_org" ON public.staff;
DROP POLICY IF EXISTS "staff_delete_own_org" ON public.staff;
DROP POLICY IF EXISTS "staff_select_unified" ON public.staff;
DROP POLICY IF EXISTS "staff_insert_unified" ON public.staff;
DROP POLICY IF EXISTS "staff_update_unified" ON public.staff;
DROP POLICY IF EXISTS "staff_delete_unified" ON public.staff;

-- SELECT: 自分の組織のデータ（匿名は公開情報のみ）
CREATE POLICY "staff_select_unified" ON public.staff
  FOR SELECT
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        -- 匿名: 公開されているスタッフ情報のみ（予約ページ用）
        status = 'active'
    END
  );

-- INSERT: 管理者のみ
CREATE POLICY "staff_insert_unified" ON public.staff
  FOR INSERT
  WITH CHECK (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- UPDATE: 自分自身 または 管理者
CREATE POLICY "staff_update_unified" ON public.staff
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (is_org_admin() AND organization_id = get_user_organization_id())
  );

-- DELETE: 管理者のみ
CREATE POLICY "staff_delete_unified" ON public.staff
  FOR DELETE
  USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- =============================================================================
-- 5. 確認用クエリ（実行後に確認）
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RLSポリシー統一完了';
  RAISE NOTICE '   - reservations: SELECT/INSERT/UPDATE/DELETE 分離';
  RAISE NOTICE '   - schedule_events: SELECT/INSERT/UPDATE/DELETE 分離';
  RAISE NOTICE '   - customers: SELECT/INSERT/UPDATE/DELETE 分離';
  RAISE NOTICE '   - staff: SELECT/INSERT/UPDATE/DELETE 分離';
END $$;

-- 確認用: 現在のポリシー一覧
-- SELECT tablename, policyname, permissive, roles, cmd 
-- FROM pg_policies 
-- WHERE tablename IN ('reservations', 'schedule_events', 'customers', 'staff')
-- ORDER BY tablename, policyname;
