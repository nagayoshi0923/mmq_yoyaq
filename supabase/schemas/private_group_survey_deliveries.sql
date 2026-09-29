-- 案内の保存・再送番号・配送結果を保持。クライアントから直接操作させない。
CREATE TABLE IF NOT EXISTS public.private_group_survey_deliveries (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 group_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 schedule_event_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('manual','approval')),
 message_id uuid NOT NULL,
 customer_email text,
 customer_name text NOT NULL,
 subject text NOT NULL,
 message_body text NOT NULL CHECK(length(btrim(message_body))>0 AND length(message_body)<=20000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','superseded')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 lease_until timestamptz,
 lease_token uuid,
 provider_payload jsonb CHECK(provider_payload IS NULL OR jsonb_typeof(provider_payload)='object'),
 provider_account_hash text,
 provider_message_id text,
 email_log_id uuid,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS private_group_survey_deliveries_pending_idx ON public.private_group_survey_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS private_group_survey_deliveries_group_idx ON public.private_group_survey_deliveries(group_id,created_at DESC);
ALTER TABLE public.private_group_survey_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_survey_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.private_group_survey_deliveries TO service_role;
COMMENT ON TABLE public.private_group_survey_deliveries IS '事前配役アンケートの案内と配送記録。削除連動せず履歴を保持。要求番号の再試行と明示的再案内を区別する。';
