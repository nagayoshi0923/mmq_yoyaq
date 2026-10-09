-- 通知ベルの数字を「新着」にする（2026-10-09、社長承認済み）
-- これまでベルの数字は未読件数で、1 件ずつ押すか「すべて既読」まで消えなかった。
-- 数字は「前回ベルを開いた時刻より後に作られた通知の件数」にし、開いたら 0 にする。
-- 一覧の未読の印（赤い点・太字）は従来どおり user_notifications.is_read で持つ。
--
-- 「最後に開いた時刻」はログイン利用者ごとに 1 行。端末をまたいでも同じ数字にするため DB に置く。
-- users に列を足さない理由: users の本人更新は役割・組織の書き換え防止の条件つきで、
-- ベルを開くたびの書き込みをそこへ混ぜたくない。お客様・スタッフどちらも auth.users 単位で持てる小さな表にする。
-- 組織をまたぐ情報ではない（本人の閲覧時刻だけ）ので organization_id は持たない。

CREATE TABLE IF NOT EXISTS public.user_notification_views (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_notification_views FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.user_notification_views TO authenticated;

DROP POLICY IF EXISTS user_notification_views_select_self ON public.user_notification_views;
CREATE POLICY user_notification_views_select_self ON public.user_notification_views
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_notification_views_insert_self ON public.user_notification_views;
CREATE POLICY user_notification_views_insert_self ON public.user_notification_views
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_notification_views_update_self ON public.user_notification_views;
CREATE POLICY user_notification_views_update_self ON public.user_notification_views
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.user_notification_views IS '通知ベルを最後に開いた時刻（ログイン利用者ごとに 1 行）。ベルの数字＝これより後に作られた通知の件数';
