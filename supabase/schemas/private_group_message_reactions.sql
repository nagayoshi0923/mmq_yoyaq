-- 正規定義（migration 20261010100000_private_group_chat_phase2.sql）。ブラウザの役割には権限を付けない（RPC private_group_chat_action / private_group_chat_state 経由）
CREATE TABLE IF NOT EXISTS public.private_group_message_reactions (
  message_id uuid NOT NULL REFERENCES public.private_group_messages(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, member_id)
);
ALTER TABLE public.private_group_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_message_reactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_message_reactions TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_message_reactions_group ON public.private_group_message_reactions(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_message_reactions_member ON public.private_group_message_reactions(member_id);
COMMENT ON TABLE public.private_group_message_reactions IS '発言へのリアクション（1 人 1 種類）。読み書きは参加者本人だけ（RPC 経由）';

