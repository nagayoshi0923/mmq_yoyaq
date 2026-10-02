-- #757: メールを「送らなかった」ことも email_logs に残せるように、status に 'skipped' を加える。
-- 送信先不一致・受付経路が MMQ 以外・Resend 未設定などで送らずに終わった場合に、理由を error_message に入れて記録する。
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_status_check
  CHECK (status = ANY (ARRAY['queued','sent','delivered','opened','clicked','bounced','complained','failed','delivery_delayed','skipped']));
