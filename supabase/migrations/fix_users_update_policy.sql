-- usersテーブルの更新ポリシーを修正
-- Edge Functionからスタッフ招待時にロールを更新できるようにする

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "users_update_self" ON public.users;

-- 新しいポリシーを作成
-- 1. 自分自身のレコードは更新可能
-- 2. admin/staffは全てのユーザーのロールを更新可能（サービスロールキーを使用する場合も含む）
CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid() OR  -- 自分自身
    public.is_staff_or_admin() OR  -- admin/staff
    auth.role() = 'service_role'  -- サービスロールキー
  );

-- 成功メッセージ
SELECT '✅ usersテーブルの更新ポリシーを修正しました' AS status;

