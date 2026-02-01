-- =============================================================================
-- 🚨 緊急修正: RLSポリシーのパフォーマンス問題
-- 
-- 問題: ヘルパー関数が SECURITY INVOKER で users テーブルをクエリするため、
--       RLS評価時に連鎖的なクエリが発生し、statement timeout
-- 
-- 解決: 
--   1. ヘルパー関数を SECURITY DEFINER に変更（RLSバイパス）
--   2. ポリシーをシンプル化して関数呼び出しを最小化
-- =============================================================================

-- =============================================================================
-- 1. ヘルパー関数を SECURITY DEFINER に変更
-- =============================================================================

-- get_user_organization_id: SECURITY DEFINER でRLSバイパス
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

-- is_admin: SECURITY DEFINER でRLSバイパス
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

-- is_org_admin: SECURITY DEFINER でRLSバイパス
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

-- is_staff_or_admin: SECURITY DEFINER でRLSバイパス
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'staff', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

-- =============================================================================
-- 2. staff テーブルのポリシーをシンプル化
-- =============================================================================

DROP POLICY IF EXISTS "staff_select_unified" ON public.staff;
DROP POLICY IF EXISTS "staff_select_all" ON public.staff;

-- SELECT: 認証済みユーザーは全て、匿名はactiveのみ
CREATE POLICY "staff_select_unified" ON public.staff
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL  -- 認証済み: 全て表示
    OR status = 'active'     -- 匿名: activeのみ
  );

-- =============================================================================
-- 3. schedule_events テーブルのポリシーをシンプル化
-- =============================================================================

DROP POLICY IF EXISTS "schedule_events_select_unified" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_all" ON public.schedule_events;

-- SELECT: 認証済みユーザーは全て、匿名はキャンセルされていないもののみ
CREATE POLICY "schedule_events_select_unified" ON public.schedule_events
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL  -- 認証済み: 全て表示
    OR is_cancelled = false  -- 匿名: キャンセルされていないもののみ
  );

-- =============================================================================
-- 4. users テーブルの SELECT ポリシーを確認・修正
-- =============================================================================

-- 既存のポリシーを削除して再作成
DROP POLICY IF EXISTS "users_select_self" ON public.users;

-- SELECT: 自分自身のデータのみ（シンプルに）
CREATE POLICY "users_select_self" ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- =============================================================================
-- 5. reservations テーブルのポリシーをシンプル化（SELECTのみ）
-- =============================================================================

DROP POLICY IF EXISTS "reservations_select_unified" ON public.reservations;

-- SELECT: 認証済みユーザーは組織フィルタなしで参照可能
-- （実際のフィルタリングはアプリ側で行う）
CREATE POLICY "reservations_select_unified" ON public.reservations
  FOR SELECT
  USING (
    -- 顧客: 自分の予約
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR
    -- スタッフ/管理者: 認証済みなら組織データ参照可能
    (auth.uid() IS NOT NULL AND organization_id = get_user_organization_id())
  );

-- =============================================================================
-- 6. customers テーブルのポリシーをシンプル化（SELECTのみ）
-- =============================================================================

DROP POLICY IF EXISTS "customers_select_unified" ON public.customers;

-- SELECT: 自分自身 または 認証済みユーザー
CREATE POLICY "customers_select_unified" ON public.customers
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (auth.uid() IS NOT NULL AND organization_id = get_user_organization_id())
  );

-- =============================================================================
-- 7. 確認用
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RLSパフォーマンス修正完了';
  RAISE NOTICE '   - ヘルパー関数: SECURITY DEFINER に変更';
  RAISE NOTICE '   - staff/schedule_events: SELECTポリシーをシンプル化';
  RAISE NOTICE '   - users: SELECTポリシーを再作成';
END $$;
