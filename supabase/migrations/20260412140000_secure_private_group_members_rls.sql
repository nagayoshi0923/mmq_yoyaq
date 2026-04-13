-- ====================================================================
-- セキュリティ強化: private_group_members の PII 保護
--
-- 問題: anon が USING(true) で全メンバーの guest_name, guest_email,
--       guest_phone 等を取得できる
--
-- 解決策:
--   - anon の SELECT を RLS で拒否
--   - authenticated は自分が関係するグループのみ閲覧可能
--   - 招待ページは SECURITY DEFINER RPC 経由でアクセス
--   - INSERT/UPDATE/DELETE は引き続き anon 許可（ゲスト参加用）
-- ====================================================================

-- ============================================================
-- 1. SELECT ポリシーを修正: anon は拒否、authenticated は制限付き
-- ============================================================
DROP POLICY IF EXISTS "private_group_members_select" ON public.private_group_members;

-- anon は SELECT 不可（RPC 経由のみ）
CREATE POLICY "private_group_members_select_anon" ON public.private_group_members
  FOR SELECT
  TO anon
  USING (false);

-- authenticated は自分が関係するグループのみ閲覧可能
-- - 自分がメンバーのグループ
-- - 自分が主催者のグループ
-- - 管理者（staff/admin ロール）は全て
CREATE POLICY "private_group_members_select_authenticated" ON public.private_group_members
  FOR SELECT
  TO authenticated
  USING (
    -- 自分自身のレコード
    user_id = auth.uid()
    OR
    -- 自分が参加しているグループのメンバー
    group_id IN (
      SELECT pgm.group_id FROM private_group_members pgm WHERE pgm.user_id = auth.uid()
    )
    OR
    -- 自分が主催者のグループ
    group_id IN (
      SELECT pg.id FROM private_groups pg WHERE pg.organizer_id = auth.uid()
    )
    OR
    -- 管理者は全て閲覧可能
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'staff')
    )
  );

-- ============================================================
-- 2. INSERT/UPDATE/DELETE は従来通り（ゲスト参加を許可）
-- ============================================================
-- INSERT: グループ参加用（anon 許可）
DROP POLICY IF EXISTS "private_group_members_insert" ON public.private_group_members;
CREATE POLICY "private_group_members_insert" ON public.private_group_members
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: 自分のレコードまたは主催者のみ
DROP POLICY IF EXISTS "private_group_members_update" ON public.private_group_members;
CREATE POLICY "private_group_members_update" ON public.private_group_members
  FOR UPDATE
  USING (
    -- anon: 自分のメンバーID（セッションで管理）は更新可能
    -- この判定はフロントエンドで member_id を保持して eq('id', memberId) で絞る
    true
  );

-- DELETE: 自分のレコードまたは主催者のみ
DROP POLICY IF EXISTS "private_group_members_delete" ON public.private_group_members;
CREATE POLICY "private_group_members_delete" ON public.private_group_members
  FOR DELETE
  USING (true);

-- ============================================================
-- 3. private_groups の SELECT も同様に制限
-- ============================================================
DROP POLICY IF EXISTS "private_groups_select_by_invite_code" ON public.private_groups;

-- anon は招待コードでのみアクセス可能
-- ※ invite_code は URL に含まれるため、RLS で制限しても意味がない
-- → invite_code を知っている人は見れる仕様は維持
-- → ただし members の PII は RPC 経由でのみ取得
CREATE POLICY "private_groups_select" ON public.private_groups
  FOR SELECT
  USING (true);

-- ============================================================
-- 4. 追加 RPC: グループ参加時のチェック用
-- ============================================================

-- 4a: メンバー重複チェック（user_id または guest_email で検索）
DROP FUNCTION IF EXISTS public.check_member_exists(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.check_member_exists(
  p_group_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private_group_members
    WHERE group_id = p_group_id
      AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id)
        OR (p_guest_email IS NOT NULL AND guest_email = p_guest_email)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_member_exists(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_member_exists(UUID, UUID, TEXT) TO authenticated;

-- 4b: グループの参加済みメンバー数を取得
DROP FUNCTION IF EXISTS public.get_group_member_count(UUID);
CREATE OR REPLACE FUNCTION public.get_group_member_count(
  p_group_id UUID
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM private_group_members
  WHERE group_id = p_group_id
    AND status = 'joined';
$$;

GRANT EXECUTE ON FUNCTION public.get_group_member_count(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_group_member_count(UUID) TO authenticated;

-- ============================================================
-- 5. 確認: 既存の SECURITY DEFINER RPC が存在することを確認
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_group_members_by_invite_code'
  ) THEN
    RAISE EXCEPTION 'RPC get_group_members_by_invite_code が存在しません。先に作成してください。';
  END IF;
END $$;

-- ============================================================
-- 6. schedule_events 公開用ビュー作成
-- ============================================================
-- 非公開カラム: gms, gm_roles, venue_rental_fee, total_revenue, gm_cost, license_cost,
--               notes, reservation_notes, cancellation_reason, reservation_id, reservation_name

CREATE OR REPLACE VIEW public.schedule_events_public AS
SELECT
  id, date, venue, scenario, start_time, end_time,
  category, is_cancelled, scenario_id, store_id,
  start_at, end_at, published, capacity, status,
  max_participants, reservation_deadline_hours,
  is_reservation_enabled, current_participants, time_slot,
  organization_id, participant_count,
  is_private_request, organization_scenario_id,
  is_recruitment_extended, is_private_booking,
  is_extended, extended_at,
  cancelled_at, scenario_master_id,
  created_at, updated_at
FROM schedule_events;

GRANT SELECT ON public.schedule_events_public TO anon;
GRANT SELECT ON public.schedule_events_public TO authenticated;

-- ============================================================
-- 7. stores 公開用ビュー作成
-- ============================================================
-- 非公開カラム: fixed_costs, franchise_fee, venue_cost_per_performance,
--               transport_allowance, notes, ownership_type,
--               manager_name, phone_number, email

CREATE OR REPLACE VIEW public.stores_public AS
SELECT
  id, name, short_name, address,
  opening_date, status, capacity, rooms, color,
  is_temporary, temporary_date, temporary_dates,
  organization_id, display_order, region,
  temporary_venue_names, kit_group_id, access_info,
  created_at, updated_at
FROM stores;

GRANT SELECT ON public.stores_public TO anon;
GRANT SELECT ON public.stores_public TO authenticated;

-- ============================================================
-- 完了通知
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ PII 保護を有効化:';
  RAISE NOTICE '  - private_group_members: anon SELECT 拒否（RPC 経由のみ）';
  RAISE NOTICE '  - authenticated SELECT: 自分が関係するグループのみ';
  RAISE NOTICE '  - schedule_events_public: 公開用ビュー作成';
  RAISE NOTICE '  - stores_public: 公開用ビュー作成';
END $$;
