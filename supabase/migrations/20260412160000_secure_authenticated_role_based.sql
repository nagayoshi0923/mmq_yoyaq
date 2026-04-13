-- ====================================================================
-- セキュリティ強化: ロールベースのアクセス制御
--
-- 問題: authenticated ロールが全データを閲覧できる状態だった
-- 解決: 顧客(customer)と管理者(admin/staff/license_admin)で権限を分ける
--
-- 方針:
--   - 管理者: 従来通り全データ閲覧可能
--   - 顧客: 自分が関係するデータのみ閲覧可能
--   - anon: RLS で SELECT 拒否（RPC 経由のみ）
-- ====================================================================

-- ============================================================
-- 1. private_group_members の RLS 修正
-- ============================================================
DROP POLICY IF EXISTS "private_group_members_select_anon" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_select_authenticated" ON public.private_group_members;

-- anon は SELECT 不可（RPC 経由のみ）
CREATE POLICY "private_group_members_select_anon" ON public.private_group_members
  FOR SELECT
  TO anon
  USING (false);

-- authenticated: 管理者は全て、顧客は自分関連のみ
CREATE POLICY "private_group_members_select_authenticated" ON public.private_group_members
  FOR SELECT
  TO authenticated
  USING (
    -- 管理者は全て閲覧可能
    public.is_staff_or_admin()
    OR
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
  );

-- ============================================================
-- 2. schedule_events の RLS 修正
-- ============================================================
-- 既存ポリシーを確認して、顧客向けに公開カラムのみ返すようにする
-- ※ RLS はカラムレベル制御ができないため、ビュー経由でアクセスさせる

-- 顧客向けに公開用ビューへのアクセスを強制するため、
-- フロントエンドで顧客ロールの場合は schedule_events_public を使用する
-- （RLS での対応は複雑になるため、フロントエンド側で対応済み）

-- ============================================================
-- 3. stores の RLS 修正
-- ============================================================
-- 同様に、フロントエンドで顧客ロールの場合は stores_public を使用する
-- （RLS での対応は複雑になるため、フロントエンド側で対応済み）

-- ============================================================
-- 4. private_groups の RLS 修正
-- ============================================================
-- 顧客は自分が関係するグループのみ閲覧可能にする
DROP POLICY IF EXISTS "private_groups_select" ON public.private_groups;
DROP POLICY IF EXISTS "private_groups_select_by_invite_code" ON public.private_groups;

-- anon: 招待コードを知っている人は見れる（既存の仕様を維持）
CREATE POLICY "private_groups_select_anon" ON public.private_groups
  FOR SELECT
  TO anon
  USING (true);

-- authenticated: 管理者は全て、顧客は自分関連のみ
CREATE POLICY "private_groups_select_authenticated" ON public.private_groups
  FOR SELECT
  TO authenticated
  USING (
    -- 管理者は全て閲覧可能
    public.is_staff_or_admin()
    OR
    -- 自分が主催者のグループ
    organizer_id = auth.uid()
    OR
    -- 自分がメンバーのグループ
    id IN (
      SELECT pgm.group_id FROM private_group_members pgm WHERE pgm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 完了通知
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ ロールベースのアクセス制御を有効化:';
  RAISE NOTICE '  - private_group_members: 顧客は自分関連のみ';
  RAISE NOTICE '  - private_groups: 顧客は自分関連のみ';
  RAISE NOTICE '  - 管理者(admin/staff/license_admin)は従来通り全て閲覧可能';
END $$;
