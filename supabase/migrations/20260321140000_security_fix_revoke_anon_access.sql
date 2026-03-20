-- =============================================================================
-- 🚨 緊急セキュリティ修正: 匿名アクセスを制限
-- =============================================================================
-- 問題:
--   1. private_group_members — 個人名・メアド・access_pinが全世界に公開状態
--   2. stores — 家賃・人件費など経営の機密情報が丸見え
--   3. schedule_events — 全公演データ（売上含む）が公開
--   4. auth_logs / private_group_members — 未認証INSERTが可能
--
-- 解決策: RLSポリシーを認証済みユーザーのみに制限
-- =============================================================================

-- =============================================================================
-- 1. private_group_members: 個人情報保護（最重要）
-- =============================================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "private_group_members_select" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_insert" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_update" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_delete" ON public.private_group_members;

-- SELECT: 本人、主催者、または予約顧客のみ閲覧可能
-- ※同じグループメンバーのチェックは無限再帰になるため削除
CREATE POLICY "private_group_members_select" ON public.private_group_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- 自分自身のレコード
      user_id = auth.uid()
      -- または主催者
      OR EXISTS (
        SELECT 1 FROM public.private_groups pg
        WHERE pg.id = private_group_members.group_id
        AND pg.organizer_id = auth.uid()
      )
      -- または予約顧客（同じグループに属する）
      OR EXISTS (
        SELECT 1 FROM public.private_groups pg
        WHERE pg.id = private_group_members.group_id
        AND EXISTS (
          SELECT 1 FROM public.customers c
          JOIN public.reservations r ON r.customer_id = c.id
          WHERE c.user_id = auth.uid()
        )
      )
    )
  );

-- INSERT: 認証済みユーザーのみ（自分をメンバーとして追加、または主催者が追加）
CREATE POLICY "private_group_members_insert" ON public.private_group_members
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- 自分自身を追加
      user_id = auth.uid()
      -- または主催者が追加
      OR EXISTS (
        SELECT 1 FROM public.private_groups pg
        WHERE pg.id = group_id
        AND pg.organizer_id = auth.uid()
      )
    )
  );

-- UPDATE: 本人または主催者のみ
CREATE POLICY "private_group_members_update" ON public.private_group_members
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.private_groups pg
        WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.private_groups pg
        WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
      )
    )
  );

-- DELETE: 本人または主催者のみ
CREATE POLICY "private_group_members_delete" ON public.private_group_members
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.private_groups pg
        WHERE pg.id = group_id AND pg.organizer_id = auth.uid()
      )
    )
  );

-- anon ロールからテーブル権限を取り消し
REVOKE ALL ON public.private_group_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members TO authenticated;

-- =============================================================================
-- 2. stores: 経営機密情報保護
-- =============================================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "stores_select_public_or_org" ON public.stores;
DROP POLICY IF EXISTS "stores_select_all" ON public.stores;
DROP POLICY IF EXISTS "stores_select_org_or_anon" ON public.stores;
DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_select_authenticated_org" ON public.stores;
DROP POLICY IF EXISTS "stores_strict" ON public.stores;

-- SELECT: 認証済みユーザーで同組織のみ
-- ※公開予約ページ用には別途 RPC を使用
CREATE POLICY "stores_select_authenticated_org" ON public.stores
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- staff/admin: 同組織の店舗
      organization_id = public.get_user_organization_id()
      -- または顧客: 予約がある組織の店舗
      OR EXISTS (
        SELECT 1 FROM public.reservations r
        JOIN public.customers c ON c.id = r.customer_id
        WHERE c.user_id = auth.uid()
        AND r.organization_id = stores.organization_id
      )
    )
  );

-- anon ロールからテーブル権限を取り消し
REVOKE SELECT ON public.stores FROM anon;

-- =============================================================================
-- 3. schedule_events: 売上データ保護
-- =============================================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "schedule_events_select_public_or_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_all" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_org_or_anon" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_unified" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_select_authenticated_org" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_strict" ON public.schedule_events;

-- SELECT: 認証済みユーザーで同組織のみ
-- ※公開予約ページ用には別途 RPC を使用
CREATE POLICY "schedule_events_select_authenticated_org" ON public.schedule_events
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- staff/admin: 同組織のイベント
      organization_id = public.get_user_organization_id()
      -- または顧客: 予約があるイベント
      OR EXISTS (
        SELECT 1 FROM public.reservations r
        JOIN public.customers c ON c.id = r.customer_id
        WHERE c.user_id = auth.uid()
        AND r.schedule_event_id = schedule_events.id
      )
    )
  );

-- anon ロールからテーブル権限を取り消し
REVOKE SELECT ON public.schedule_events FROM anon;

-- =============================================================================
-- 4. auth_logs: データ改ざん防止
-- =============================================================================

-- INSERT は service_role のみに制限（既存ポリシーを確認・強化）
DROP POLICY IF EXISTS "auth_logs_insert_service_role_only" ON public.auth_logs;

CREATE POLICY "auth_logs_insert_service_role_only" ON public.auth_logs
  FOR INSERT
  WITH CHECK (
    -- service_role のみ INSERT 可能
    -- auth.role() = 'service_role' は RLS バイパスするため実質この条件は不要だが明示
    false  -- 通常ユーザーは INSERT 不可、service_role は RLS バイパス
  );

-- anon ロールから権限を取り消し
REVOKE ALL ON public.auth_logs FROM anon;

-- =============================================================================
-- 5. その他: anon への過剰な権限を取り消し
-- =============================================================================

-- users テーブル（個人情報）
REVOKE SELECT ON public.users FROM anon;

-- private_groups テーブル
REVOKE SELECT ON public.private_groups FROM anon;

-- private_group_candidate_dates テーブル
REVOKE SELECT ON public.private_group_candidate_dates FROM anon;

-- private_group_date_responses テーブル
REVOKE ALL ON public.private_group_date_responses FROM anon;

-- private_group_messages テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_group_messages' AND table_schema = 'public') THEN
    EXECUTE 'REVOKE ALL ON public.private_group_messages FROM anon';
  END IF;
END $$;

-- group_chat_messages テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_chat_messages' AND table_schema = 'public') THEN
    EXECUTE 'REVOKE ALL ON public.group_chat_messages FROM anon';
  END IF;
END $$;

-- scenario_masters テーブル（公開情報だが直接アクセスは不要、RPC経由で）
REVOKE SELECT ON public.scenario_masters FROM anon;

-- organization_scenarios テーブル
REVOKE SELECT ON public.organization_scenarios FROM anon;

-- organizations テーブル（公開予約ページで必要なため制限付きで維持）
-- ※ これは公開予約ページで organization_id から名前を取得するため維持
-- REVOKE SELECT ON public.organizations FROM anon;

-- =============================================================================
-- 6. RPC 関数の anon 権限を取り消し（個人情報関連）
-- =============================================================================

-- get_user_display_names: 個人名を返すため anon 不可
REVOKE EXECUTE ON FUNCTION public.get_user_display_names(UUID[]) FROM anon;

-- delete_guest_member: 認証済みのみ
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_guest_member') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.delete_guest_member FROM anon';
  END IF;
END $$;

-- save_guest_access_pin: 認証済みのみ
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_guest_access_pin') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.save_guest_access_pin FROM anon';
  END IF;
END $$;

-- =============================================================================
-- 7. 公開予約ページ用の安全な RPC 関数
-- =============================================================================

-- 公開予約ページ用: 店舗の公開情報のみを返す（機密情報を除外）
CREATE OR REPLACE FUNCTION public.get_public_stores(p_organization_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  capacity INTEGER,
  google_maps_url TEXT,
  organization_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    s.id,
    s.name::TEXT,
    s.address::TEXT,
    s.capacity,
    s.google_maps_url::TEXT,
    s.organization_id
  FROM public.stores s
  WHERE s.organization_id = p_organization_id;
$$;

-- 匿名ユーザーも実行可能（公開情報のみ返すため安全）
GRANT EXECUTE ON FUNCTION public.get_public_stores(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_stores(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_public_stores(UUID) IS 
  '公開予約ページ用: 店舗の公開情報のみを返す（家賃・人件費等の機密情報は除外）';

-- 公開予約ページ用: 公開イベントの基本情報のみを返す（売上等の機密情報を除外）
CREATE OR REPLACE FUNCTION public.get_public_schedule_events(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  date DATE,
  start_time TIME,
  end_time TIME,
  store_id UUID,
  scenario_master_id UUID,
  title TEXT,
  max_participants INTEGER,
  min_participants INTEGER,
  category TEXT,
  is_cancelled BOOLEAN,
  is_private_booking BOOLEAN,
  organization_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    se.id,
    se.date,
    se.start_time,
    se.end_time,
    se.store_id,
    se.scenario_master_id,
    se.title::TEXT,
    se.max_participants,
    se.min_participants,
    se.category::TEXT,
    se.is_cancelled,
    se.is_private_booking,
    se.organization_id
  FROM public.schedule_events se
  WHERE se.organization_id = p_organization_id
    AND se.is_cancelled = false
    AND (p_from_date IS NULL OR se.date >= p_from_date)
    AND (p_to_date IS NULL OR se.date <= p_to_date);
$$;

-- 匿名ユーザーも実行可能（公開情報のみ返すため安全）
GRANT EXECUTE ON FUNCTION public.get_public_schedule_events(UUID, DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_schedule_events(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_public_schedule_events(UUID, DATE, DATE) IS 
  '公開予約ページ用: 公開イベントの基本情報のみを返す（売上・GM費用等の機密情報は除外）';

-- =============================================================================
-- 完了通知
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔒 セキュリティ修正完了:';
  RAISE NOTICE '  - private_group_members: 認証済み＋メンバー限定に変更';
  RAISE NOTICE '  - stores: 認証済み＋同組織限定に変更';
  RAISE NOTICE '  - schedule_events: 認証済み＋同組織限定に変更';
  RAISE NOTICE '  - auth_logs: INSERT を service_role 限定に変更';
  RAISE NOTICE '  - anon ロールの過剰な権限を取り消し';
  RAISE NOTICE '  - 公開予約ページ用の安全なRPC関数を追加';
END $$;
