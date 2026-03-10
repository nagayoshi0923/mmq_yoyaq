-- メンバー削除時にチャットメッセージを保持するよう外部キー制約を変更

-- 1. member_idをNULL許容に変更
ALTER TABLE public.private_group_messages
ALTER COLUMN member_id DROP NOT NULL;

-- 2. 既存の外部キー制約を削除
ALTER TABLE public.private_group_messages
DROP CONSTRAINT IF EXISTS private_group_messages_member_id_fkey;

-- 3. ON DELETE SET NULLで外部キー制約を再作成
ALTER TABLE public.private_group_messages
ADD CONSTRAINT private_group_messages_member_id_fkey
FOREIGN KEY (member_id) REFERENCES public.private_group_members(id) ON DELETE SET NULL;

-- 4. コメント更新
COMMENT ON COLUMN public.private_group_messages.member_id IS 'メッセージ送信者（グループメンバー）。NULLの場合は退出したメンバー';

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ チャットメッセージの外部キー制約をON DELETE SET NULLに変更しました';
END $$;
