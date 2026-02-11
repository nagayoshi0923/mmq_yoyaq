-- =============================================================================
-- 緊急修正: PlatformTop ページ（/）の表示復旧
-- =============================================================================
-- 問題1: scenario_masters を staff/admin のみに制限したが、
--   PlatformTop ページは匿名で「承認済みマスタ」をクエリして
--   シナリオフィルタに使用している。
--   → 匿名ユーザーは scenario_masters が 0件 → イベントが全て消える
--
-- 問題2: scenarios ポリシーが staff/admin に自組織+共有のみ許可。
--   PlatformTop は schedule_events を scenarios:scenario_id!inner で JOIN。
--   → 他組織のシナリオが見えない → 他組織のイベントが全て消える
--
-- 対応コード箇所:
--   src/pages/PlatformTop/index.tsx 行145: scenario_masters クエリ
--   src/pages/PlatformTop/index.tsx 行160: schedule_events + scenarios !inner JOIN
-- =============================================================================

-- =============================================================================
-- 1. scenario_masters: 承認済みマスタは全ユーザーが閲覧可能
-- =============================================================================
DROP POLICY IF EXISTS "scenario_masters_select_staff_or_admin" ON public.scenario_masters;

CREATE POLICY "scenario_masters_select_public_or_staff"
  ON public.scenario_masters
  FOR SELECT
  USING (
    -- 承認済みマスタはカタログデータとして全ユーザーに公開（匿名含む）
    master_status = 'approved'
    -- staff/admin: 自組織が提出したマスタ（ドラフト・審査中・却下含む）
    OR (is_staff_or_admin() AND submitted_by_organization_id = get_user_organization_id())
    -- ライセンス管理者は全件
    OR is_license_admin()
  );

-- =============================================================================
-- 2. scenarios: staff/admin は available な他組織シナリオも閲覧可能
-- =============================================================================
DROP POLICY IF EXISTS "scenarios_select_public_or_org" ON public.scenarios;

CREATE POLICY "scenarios_select_public_or_org"
  ON public.scenarios
  FOR SELECT
  USING (
    CASE
      -- staff/admin: 自組織の全シナリオ + 共有 + 他組織の公開シナリオ
      WHEN is_staff_or_admin() THEN
        organization_id = get_user_organization_id()
        OR is_shared = true
        OR status = 'available'
      -- 匿名/customer: 公開シナリオのみ
      ELSE
        status = 'available'
    END
  );
