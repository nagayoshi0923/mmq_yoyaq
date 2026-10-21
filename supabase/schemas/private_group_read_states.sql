-- 正規定義（migration 20261010100000_private_group_chat_phase2.sql）。ブラウザの役割には権限を付けない（RPC private_group_chat_action / private_group_chat_state 経由）
CREATE TABLE IF NOT EXISTS public.private_group_read_states (
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);
ALTER TABLE public.private_group_read_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_read_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_read_states TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_read_states_member ON public.private_group_read_states(member_id);
COMMENT ON TABLE public.private_group_read_states IS '貸切グループのチャットを最後に読んだ時刻（参加者ごとに 1 行）。本人だけ private_group_chat_action(read) で更新';

