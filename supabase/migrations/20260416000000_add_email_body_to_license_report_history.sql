-- license_report_history に email_body, subject, author_email カラムを追加
ALTER TABLE public.license_report_history
  ADD COLUMN IF NOT EXISTS email_body   TEXT,
  ADD COLUMN IF NOT EXISTS subject      TEXT,
  ADD COLUMN IF NOT EXISTS author_email TEXT;

COMMENT ON COLUMN public.license_report_history.email_body   IS '送信したメール本文（プレーンテキスト）';
COMMENT ON COLUMN public.license_report_history.subject      IS '送信したメール件名';
COMMENT ON COLUMN public.license_report_history.author_email IS '送信先メールアドレス';

-- PostgRESTスキーマキャッシュをリフレッシュ
NOTIFY pgrst, 'reload schema';
