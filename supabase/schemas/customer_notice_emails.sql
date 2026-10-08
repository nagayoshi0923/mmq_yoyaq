-- 正規ソース: supabase/schemas/customer_notice_emails.sql
-- お客様への知らせのメールの送信待ち（マイページ改修 段階 4、migration 20261009140000）。
-- 書き込みは customer_notice_* 関数と送信処理（claim_customer_notice_emails / finish_customer_notice_email）だけ。画面からは読めない。
CREATE TABLE IF NOT EXISTS public.customer_notice_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  notification_id uuid REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  email_type text NOT NULL DEFAULT 'other',
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_text text NOT NULL,
  reply_to text,
  sender_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_until timestamptz,
  email_log_id uuid,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CONSTRAINT customer_notice_emails_dedupe_key_key UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS customer_notice_emails_due_idx ON public.customer_notice_emails(next_attempt_at) WHERE status IN ('pending','sending');
ALTER TABLE public.customer_notice_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_notice_emails FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.customer_notice_emails IS 'お客様への知らせのメール（段階 4 で足したもの）の送信待ちと結果。本文は積んだ時点の文面。{{SITE_URL}} は送信時に置き換える';

