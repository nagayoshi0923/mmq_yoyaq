-- 正規定義（migration 20261010130000_private_group_web_push.sql）。ブラウザの役割には権限を付けない（本人を確かめる RPC だけ）
CREATE TABLE IF NOT EXISTS public.private_group_notification_settings (
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_private_group_notification_settings_member ON public.private_group_notification_settings(member_id);
ALTER TABLE public.private_group_notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_notification_settings TO service_role;
COMMENT ON TABLE public.private_group_notification_settings IS '貸切グループごとのプッシュ通知の ON/OFF（行が無ければ ON）。本人だけ RPC private_group_push_setting で更新';
