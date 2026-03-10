-- private_group_messagesのINSERTポリシーをゲスト対応に修正

-- 元のポリシーを削除
DROP POLICY IF EXISTS "private_group_messages_insert_member" ON public.private_group_messages;
DROP POLICY IF EXISTS "private_group_messages_anon_insert" ON public.private_group_messages;

-- 新しいポリシー: member_idが有効なメンバーであれば投稿可能（認証・ゲスト両対応）
CREATE POLICY "private_group_messages_insert_member" ON public.private_group_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id
        AND pgm.group_id = private_group_messages.group_id
        AND pgm.status = 'joined'
    )
  );

-- SELECTポリシーも更新（誰でもグループのメッセージを閲覧可能に）
DROP POLICY IF EXISTS "private_group_messages_select_member" ON public.private_group_messages;
DROP POLICY IF EXISTS "private_group_messages_anon_select" ON public.private_group_messages;

CREATE POLICY "private_group_messages_select" ON public.private_group_messages
  FOR SELECT
  USING (true);

-- 通知
DO $$
BEGIN
  RAISE NOTICE 'private_group_messagesのRLSポリシーをゲスト対応に更新しました';
END $$;
