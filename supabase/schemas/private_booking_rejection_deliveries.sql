-- 却下保存と同じトランザクションで作る送信予定。クライアントから直接アクセスさせない。
CREATE TABLE IF NOT EXISTS public.private_booking_rejection_deliveries (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  cancelled_at timestamptz NOT NULL,
  customer_email text,
  customer_name text NOT NULL,
  scenario_title text NOT NULL,
  message_body text NOT NULL CHECK (length(btrim(message_body)) > 0 AND length(message_body) <= 20000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain','superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  provider_payload jsonb CHECK (provider_payload IS NULL OR jsonb_typeof(provider_payload)='object'),
  provider_account_hash text,
  provider_message_id text,
  email_log_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reservation_id,cancelled_at)
);
CREATE INDEX IF NOT EXISTS private_rejection_delivery_pending_idx
  ON public.private_booking_rejection_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
-- 新規テーブルだけRLSを有効化。クライアント向けポリシーは作らず、既存テーブルのポリシーは変更しない。
ALTER TABLE public.private_booking_rejection_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_rejection_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.private_booking_rejection_deliveries TO service_role;
COMMENT ON TABLE public.private_booking_rejection_deliveries IS
  '貸切却下の送信予定と結果。予約取消世代ごとに一意。本人・スタッフも専用RPC経由のみ。履歴保全のため予約削除と連動削除しない。';
