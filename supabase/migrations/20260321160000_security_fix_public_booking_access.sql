-- =============================================================================
-- セキュリティ修正: 公開予約ページ用のアクセス権限を適切に設定
-- =============================================================================
-- 問題: anon権限を全取り消しした結果、公開予約ページが動作しなくなった
-- 解決: 公開ページで必要なテーブルにRLSポリシーで制限付きSELECTを許可
-- =============================================================================

-- =============================================================================
-- 1. 公開予約ページで必要なテーブルにanon SELECT権限を付与
-- =============================================================================
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.scenario_masters TO anon;
GRANT SELECT ON public.schedule_events TO anon;
GRANT SELECT ON public.organization_scenarios TO anon;

-- =============================================================================
-- 2. organizations: シンプルなポリシーに修正（usersテーブルを参照しない）
-- =============================================================================
DROP POLICY IF EXISTS "organizations_admin_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_public" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_anon" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;

-- 匿名用ポリシー（アクティブな組織のみ）
CREATE POLICY "organizations_select_anon" ON public.organizations
  FOR SELECT
  USING (is_active = true);

-- 管理用ポリシー（認証必須）
CREATE POLICY "organizations_manage_admin" ON public.organizations
  FOR ALL
  USING (auth.uid() IS NOT NULL AND is_admin())
  WITH CHECK (auth.uid() IS NOT NULL AND is_admin());

-- =============================================================================
-- 3. stores: 公開情報は閲覧可能（RLSで機密列は制限できないがフロントで制御）
-- =============================================================================
DROP POLICY IF EXISTS "stores_select_authenticated_org" ON public.stores;
DROP POLICY IF EXISTS "stores_select_public_or_org" ON public.stores;
DROP POLICY IF EXISTS "stores_select_public_safe" ON public.stores;

CREATE POLICY "stores_select_public_safe" ON public.stores
  FOR SELECT
  USING (true);

-- =============================================================================
-- 4. scenario_masters: 承認済みのみ匿名閲覧可能
-- =============================================================================
DROP POLICY IF EXISTS "scenario_masters_select_public_or_staff" ON public.scenario_masters;

CREATE POLICY "scenario_masters_select_public_or_staff" ON public.scenario_masters
  FOR SELECT
  USING (
    master_status = 'approved'
    OR (auth.uid() IS NOT NULL AND is_staff_or_admin() AND submitted_by_organization_id = get_user_organization_id())
    OR (auth.uid() IS NOT NULL AND is_license_admin())
  );

-- =============================================================================
-- 5. schedule_events: キャンセルされていないイベントのみ匿名閲覧可能
-- =============================================================================
DROP POLICY IF EXISTS "schedule_events_select_authenticated_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_public_or_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_public_safe" ON public.schedule_events;

CREATE POLICY "schedule_events_select_public_safe" ON public.schedule_events
  FOR SELECT
  USING (
    is_cancelled = false
    OR (auth.uid() IS NOT NULL AND organization_id = get_user_organization_id())
  );

-- =============================================================================
-- 6. organization_scenarios: 公開中のシナリオのみ匿名閲覧可能
-- =============================================================================
DROP POLICY IF EXISTS "organization_scenarios_select_authenticated" ON public.organization_scenarios;
DROP POLICY IF EXISTS "organization_scenarios_select_public" ON public.organization_scenarios;

CREATE POLICY "organization_scenarios_select_public" ON public.organization_scenarios
  FOR SELECT
  USING (
    org_status = 'available'
    OR (auth.uid() IS NOT NULL AND is_staff_or_admin() AND organization_id = get_user_organization_id())
    OR (auth.uid() IS NOT NULL AND is_license_admin())
  );

-- =============================================================================
-- 完了通知
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '🔒 公開予約ページ用アクセス権限を設定:';
  RAISE NOTICE '  - organizations: アクティブな組織のみ閲覧可能';
  RAISE NOTICE '  - stores: 全店舗の基本情報を閲覧可能';
  RAISE NOTICE '  - scenario_masters: 承認済みのみ閲覧可能';
  RAISE NOTICE '  - schedule_events: キャンセルされていないイベントのみ閲覧可能';
  RAISE NOTICE '  - organization_scenarios: 公開中のシナリオのみ閲覧可能';
END $$;
