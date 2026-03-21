-- 公開予約ページ用: 未ログインユーザーも公開カテゴリのイベントを閲覧可能に
-- open/offsite カテゴリのイベントのみ anon で SELECT 可能

-- anon に SELECT 権限を付与
GRANT SELECT ON public.schedule_events TO anon;

-- 公開イベント用の SELECT ポリシーを追加
DROP POLICY IF EXISTS "schedule_events_select_public" ON public.schedule_events;
CREATE POLICY "schedule_events_select_public" ON public.schedule_events
  FOR SELECT
  USING (
    -- 公開カテゴリ（open, offsite）は誰でも閲覧可能
    category IN ('open', 'offsite')
    -- または認証済みユーザー
    OR auth.uid() IS NOT NULL
  );

-- stores テーブルも公開イベントの表示に必要なので anon に SELECT 権限を付与
GRANT SELECT ON public.stores TO anon;

-- stores の公開閲覧ポリシー（店舗名・住所などは公開情報）
DROP POLICY IF EXISTS "stores_select_public" ON public.stores;
CREATE POLICY "stores_select_public" ON public.stores
  FOR SELECT
  USING (true);

-- scenario_masters も公開シナリオ情報として必要
GRANT SELECT ON public.scenario_masters TO anon;

DROP POLICY IF EXISTS "scenario_masters_select_public" ON public.scenario_masters;
CREATE POLICY "scenario_masters_select_public" ON public.scenario_masters
  FOR SELECT
  USING (
    -- 公開ステータスのシナリオは誰でも閲覧可能
    master_status IN ('available', 'published')
    -- または認証済みユーザー
    OR auth.uid() IS NOT NULL
  );

-- organization_scenarios も公開予約ページに必要
GRANT SELECT ON public.organization_scenarios TO anon;

DROP POLICY IF EXISTS "organization_scenarios_select_public" ON public.organization_scenarios;
CREATE POLICY "organization_scenarios_select_public" ON public.organization_scenarios
  FOR SELECT
  USING (
    -- 公開ステータスのシナリオは誰でも閲覧可能
    org_status = 'available'
    -- または認証済みユーザー
    OR auth.uid() IS NOT NULL
  );

COMMENT ON POLICY "schedule_events_select_public" ON public.schedule_events IS '公開カテゴリ(open/offsite)のイベントは未ログインでも閲覧可能';
COMMENT ON POLICY "stores_select_public" ON public.stores IS '店舗情報は公開情報として誰でも閲覧可能';
COMMENT ON POLICY "scenario_masters_select_public" ON public.scenario_masters IS '公開シナリオは未ログインでも閲覧可能';
COMMENT ON POLICY "organization_scenarios_select_public" ON public.organization_scenarios IS '公開シナリオは未ログインでも閲覧可能';
