-- 正規定義（migration 20261010130000_private_group_web_push.sql）。ブラウザの役割には権限を付けない（本人を確かめる RPC だけ）
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT web_push_subscriptions_endpoint_key UNIQUE (endpoint),
  CONSTRAINT web_push_subscriptions_endpoint_check CHECK (char_length(endpoint) <= 1024
    AND endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/')
);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user ON public.web_push_subscriptions(user_id);
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;
COMMENT ON TABLE public.web_push_subscriptions IS 'ウェブプッシュの購読（端末ごと）。本人だけ RPC web_push_subscription_save / _delete で保存・削除。送信失敗（404/410）で send-web-push が消す';
