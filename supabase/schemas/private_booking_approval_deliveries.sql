-- 承認と同じトランザクションで配送予定を保存する。通知の種類ごとに再試行を分離する。
CREATE TABLE IF NOT EXISTS public.private_booking_approval_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid REFERENCES public.private_booking_approval_requests(id),
 compatibility_key text UNIQUE,
 CHECK (request_id IS NOT NULL OR compatibility_key IS NOT NULL),
 organization_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 schedule_event_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('confirmation_email','gm_email','gm_discord')),
 recipient_key text NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','superseded','skipped')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 preparation_attempted_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 provider_payload jsonb CHECK(provider_payload IS NULL OR jsonb_typeof(provider_payload)='object'),
 provider_account_hash text,
 provider_target text,
 provider_message_id text,
 email_log_id uuid,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,kind,recipient_key)
);
CREATE INDEX IF NOT EXISTS private_booking_approval_deliveries_due_idx
 ON public.private_booking_approval_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS private_booking_approval_deliveries_reservation_idx
 ON public.private_booking_approval_deliveries(organization_id,reservation_id,created_at);
ALTER TABLE public.private_booking_approval_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_approval_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.private_booking_approval_deliveries TO service_role;
COMMENT ON TABLE public.private_booking_approval_deliveries IS '貸切承認時の顧客メール・GMメール・GM Discordの配送記録。保存した宛先/本文と要求IDを再試行でも維持。ブラウザ直接操作不可。';
