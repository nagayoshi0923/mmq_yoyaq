-- ====================================================================
-- セキュリティ修正: anon の private_group_members UPDATE/DELETE を禁止
--
-- 問題: 20260330100000 で anon に UPDATE, DELETE が付与されており、
--       RLS ポリシーも USING(true) のため、
--       anon が任意のメンバーの payment_status・access_pin を改ざんしたり
--       任意のメンバーを直接削除できた。
--
-- 修正:
--   - REVOKE UPDATE, DELETE FROM anon
--   - DELETE RLS を authenticated のみに変更
--   - anon のゲスト退出は delete_guest_member RPC（SECURITY DEFINER）で処理済み
--   - フロントの直接 DELETE は isOrganizer=true（ログイン済み）のみ実行
-- ====================================================================

-- anon の UPDATE/DELETE 権限を剥奪
REVOKE UPDATE, DELETE ON public.private_group_members FROM anon;

-- DELETE RLS: authenticated のみ
DROP POLICY IF EXISTS "private_group_members_delete" ON public.private_group_members;
CREATE POLICY "private_group_members_delete" ON public.private_group_members
  FOR DELETE
  TO authenticated
  USING (true);

-- UPDATE RLS: authenticated のみ
DROP POLICY IF EXISTS "private_group_members_update" ON public.private_group_members;
CREATE POLICY "private_group_members_update" ON public.private_group_members
  FOR UPDATE
  TO authenticated
  USING (true);

-- 確認ログ
DO $$
BEGIN
  RAISE NOTICE '🔒 セキュリティ修正完了:';
  RAISE NOTICE '  - private_group_members: anon の UPDATE/DELETE を禁止';
  RAISE NOTICE '  - anon のゲスト退出は delete_guest_member RPC 経由で継続動作';
END $$;
