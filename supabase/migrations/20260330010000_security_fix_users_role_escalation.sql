-- =============================================================================
-- セキュリティ修正: users.role の権限昇格を防止
-- =============================================================================
-- 問題: 20260320020000 のポリシーでは、ログイン済みユーザーが
--       自分の role を admin に書き換えられる可能性があった
--       （WITH CHECK 句に role 変更の制限がなかったため）
-- 修正: 一般ユーザーは role・organization_id を変更不可にする
-- =============================================================================

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_self" ON public.users;

CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid()
    OR public.is_staff_or_admin()
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    -- service_role / admin / staff は全フィールド変更可能
    public.is_staff_or_admin()
    OR auth.role() = 'service_role'
    -- 一般ユーザーは自分のレコードを更新可能だが role・organization_id は変更不可
    OR (
      id = auth.uid()
      AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
      AND (
        organization_id IS NOT DISTINCT FROM
        (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
      )
    )
  );

DO $$
BEGIN
  RAISE NOTICE '🔒 users テーブル: role・organization_id の自己変更を禁止しました';
END $$;
