-- 正規定義（migration 20261010130000_private_group_web_push.sql）。ブラウザの役割には権限を付けない（本人を確かめる RPC だけ）
CREATE TABLE IF NOT EXISTS public.web_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'reply', 'notice')),
  dedupe_key text,
  message_count integer NOT NULL DEFAULT 1 CHECK (message_count >= 1),
  last_message_id uuid,
  last_message_at timestamptz,
  notification_id uuid REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL CHECK (url ~ '^/'),
  tag text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  send_after timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  delivered_count integer,
  skip_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CONSTRAINT web_push_outbox_dedupe_key_key UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_due ON public.web_push_outbox(send_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_recipient ON public.web_push_outbox(user_id, group_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_created ON public.web_push_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_group ON public.web_push_outbox(group_id);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_member ON public.web_push_outbox(member_id);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_notification ON public.web_push_outbox(notification_id);
ALTER TABLE public.web_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_outbox TO service_role;
COMMENT ON TABLE public.web_push_outbox IS 'ウェブプッシュの送信待ちと結果（段階 3）。チャットは同じグループで 30 秒以内の連続を 1 通にまとめる。7 日で消す';
