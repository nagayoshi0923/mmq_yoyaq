-- ゲストユーザー（anon）にチャットメッセージテーブルへのアクセス権限を付与

-- private_group_messages テーブル（チャット用）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_group_messages' AND table_schema = 'public') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.private_group_messages TO anon';
    EXECUTE 'GRANT SELECT, INSERT ON public.private_group_messages TO authenticated';
    RAISE NOTICE 'private_group_messagesへのアクセス権限を付与しました';
  END IF;
END $$;

-- private_group_messagesのRLSポリシーを更新（anon許可）
DO $$
BEGIN
  -- 既存のポリシーを削除して再作成
  DROP POLICY IF EXISTS "private_group_messages_anon_select" ON public.private_group_messages;
  DROP POLICY IF EXISTS "private_group_messages_anon_insert" ON public.private_group_messages;
  
  -- SELECT: 誰でもグループのメッセージを閲覧可能
  CREATE POLICY "private_group_messages_anon_select" ON public.private_group_messages
    FOR SELECT
    USING (true);
  
  -- INSERT: member_idが指定されていれば投稿可能
  CREATE POLICY "private_group_messages_anon_insert" ON public.private_group_messages
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.private_group_members pgm
        WHERE pgm.id = member_id
          AND pgm.group_id = private_group_messages.group_id
          AND pgm.status = 'joined'
      )
    );
    
  RAISE NOTICE 'private_group_messagesのRLSポリシーを更新しました';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'private_group_messagesテーブルが存在しません';
END $$;
