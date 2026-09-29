-- 通知の結果照合・未送信の再試行を監査する。メール本文やトークンは複製しない。
CREATE TABLE IF NOT EXISTS public.private_delivery_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 delivery_kind text NOT NULL CHECK(delivery_kind IN ('approval','survey','rejection')),
 delivery_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('provider_verified','retry_unsent','preparation_verified')),
 previous_status text NOT NULL,
 provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_delivery_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_delivery_resolutions FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.private_delivery_resolutions IS '貸切通知の外部受付記録照合と、送信前に失敗した通知の再試行履歴。専用RPCだけが追加する。';
