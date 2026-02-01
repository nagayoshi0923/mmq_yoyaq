-- =============================================================================
-- RLSポリシー修正: 組織フィルタ強化
-- =============================================================================
-- 
-- 【目的】
-- 認証済みスタッフが他組織のデータを参照できてしまう問題を修正。
-- - スタッフ（組織に所属するユーザー） → 自分の組織のデータのみ参照可能
-- - 顧客/匿名（組織に所属しないユーザー） → 全データ参照可能（アプリでフィルタ）
-- 
-- 【判定ロジック】
-- get_user_organization_id() が NULL → 顧客または匿名 → 全データ見える
-- get_user_organization_id() が NOT NULL → スタッフ → 自組織のみ
-- 
-- 【影響テーブル】
-- - stores
-- - scenarios
-- - schedule_events
-- - staff
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. stores（店舗情報）
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_select_all" ON public.stores;
DROP POLICY IF EXISTS "stores_select_org_or_anon" ON public.stores;

CREATE POLICY "stores_select_org_or_anon" ON public.stores
  FOR SELECT
  USING (
    -- 顧客/匿名（組織に所属しないユーザー）は全て見える
    get_user_organization_id() IS NULL OR
    -- スタッフは自分の組織のデータのみ
    organization_id = get_user_organization_id()
  );

-- -----------------------------------------------------------------------------
-- 2. scenarios（シナリオ情報）
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "scenarios_select_all" ON public.scenarios;
DROP POLICY IF EXISTS "scenarios_select_org_or_anon" ON public.scenarios;

CREATE POLICY "scenarios_select_org_or_anon" ON public.scenarios
  FOR SELECT
  USING (
    -- 顧客/匿名（組織に所属しないユーザー）は全て見える
    get_user_organization_id() IS NULL OR
    -- スタッフは自分の組織のデータまたは共有シナリオ
    organization_id = get_user_organization_id() OR
    is_shared = true
  );

-- -----------------------------------------------------------------------------
-- 3. schedule_events（スケジュールイベント）
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "schedule_events_select_all" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_org_or_anon" ON public.schedule_events;

CREATE POLICY "schedule_events_select_org_or_anon" ON public.schedule_events
  FOR SELECT
  USING (
    -- 顧客/匿名（組織に所属しないユーザー）は全て見える
    get_user_organization_id() IS NULL OR
    -- スタッフは自分の組織のデータのみ
    organization_id = get_user_organization_id()
  );

-- -----------------------------------------------------------------------------
-- 4. staff（スタッフ情報）
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_select_all" ON public.staff;
DROP POLICY IF EXISTS "staff_select_org_or_anon" ON public.staff;

CREATE POLICY "staff_select_org_or_anon" ON public.staff
  FOR SELECT
  USING (
    -- 顧客/匿名（組織に所属しないユーザー）は全て見える
    get_user_organization_id() IS NULL OR
    -- スタッフは自分の組織のデータのみ
    organization_id = get_user_organization_id()
  );

-- =============================================================================
-- 確認コメント
-- =============================================================================
COMMENT ON POLICY "stores_select_org_or_anon" ON public.stores IS 
  '匿名:全て, 認証済み:自組織のみ';
COMMENT ON POLICY "scenarios_select_org_or_anon" ON public.scenarios IS 
  '匿名:全て, 認証済み:自組織+共有';
COMMENT ON POLICY "schedule_events_select_org_or_anon" ON public.schedule_events IS 
  '匿名:全て, 認証済み:自組織のみ';
COMMENT ON POLICY "staff_select_org_or_anon" ON public.staff IS 
  '匿名:全て, 認証済み:自組織のみ';

