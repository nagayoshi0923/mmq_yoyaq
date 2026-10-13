-- 貸切グループのチャット（正規定義。baseline 20261004120000 + migration 20261010100000）
-- ブラウザの役割には権限を付けない（読み取りは private_group_read_messages、書き込みは private_group_member_action / private_group_chat_action）
CREATE TABLE IF NOT EXISTS public.private_group_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.private_group_members(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  sender_type text,
  reply_to_message_id uuid REFERENCES public.private_group_messages(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by_member_id uuid REFERENCES public.private_group_members(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.private_group_messages IS 'グループ内チャットメッセージ';
CREATE INDEX idx_private_group_messages_created_at ON public.private_group_messages USING btree (created_at DESC);
CREATE INDEX idx_private_group_messages_group_id ON public.private_group_messages USING btree (group_id);
CREATE INDEX idx_private_group_messages_member_id ON public.private_group_messages USING btree (member_id);
CREATE INDEX idx_private_group_messages_pinned ON public.private_group_messages(group_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;
