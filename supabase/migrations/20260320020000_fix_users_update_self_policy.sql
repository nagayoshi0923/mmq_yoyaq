-- usersテーブルの更新ポリシーを修正
-- カスタマーが自分自身のレコードを更新できるようにする（organization_id等の設定に必要）

-- 既存の自己更新ポリシーを削除
DROP POLICY IF EXISTS "users_update_self" ON public.users;
DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;

-- 新しいポリシーを作成
-- 1. 自分自身のレコードは更新可能
-- 2. admin/staffは全てのユーザーのロールを更新可能
-- 3. サービスロールキーは全て許可
CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid() OR
    public.is_staff_or_admin() OR
    auth.role() = 'service_role'
  )
  WITH CHECK (
    id = auth.uid() OR
    public.is_staff_or_admin() OR
    auth.role() = 'service_role'
  );
