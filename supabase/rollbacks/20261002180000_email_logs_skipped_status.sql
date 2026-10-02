-- rollback: 'skipped' の行を failed に寄せてから制約を元に戻す
UPDATE public.email_logs SET status = 'failed' WHERE status = 'skipped';
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_status_check
  CHECK (status = ANY (ARRAY['queued','sent','delivered','opened','clicked','bounced','complained','failed','delivery_delayed']));
