-- ====================================================================
-- 緊急修正: private_group_members の authenticated RLS を緩和
--
-- 問題: サブクエリを使った RLS ポリシーが正しく動作していない
-- 解決: authenticated は全データ閲覧可能に戻す（anon のみ制限）
-- ====================================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "private_group_members_select_anon" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_select_authenticated" ON public.private_group_members;

-- anon は SELECT 不可（RPC 経由のみ）
CREATE POLICY "private_group_members_select_anon" ON public.private_group_members
  FOR SELECT
  TO anon
  USING (false);

-- authenticated は全て閲覧可能（従来通り）
CREATE POLICY "private_group_members_select_authenticated" ON public.private_group_members
  FOR SELECT
  TO authenticated
  USING (true);
