-- 20261021120000_customer_notice_claim_only_ids の巻き戻し。
-- claim_customer_notice_emails を引数 p_limit だけの旧版（20261009140000 の本文）に戻す。
-- 送信処理（process-customer-notice-emails）は only_ids を渡されなければ旧版でも同じように動く。
-- 戻した後は限定試験で ID を指定できない（指定すると関数が見つからず送信処理は 503 で何も送らない）。
BEGIN;

DROP FUNCTION IF EXISTS public.claim_customer_notice_emails(integer, uuid[]);

CREATE OR REPLACE FUNCTION public.claim_customer_notice_emails(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, organization_id uuid, kind text, email_type text, to_email text, to_name text, subject text, body_text text,
  reply_to text, sender_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='customer_notice_email' AND value='on') THEN RETURN; END IF;
 RETURN QUERY
 WITH picked AS (
  SELECT q.id FROM public.customer_notice_emails q
   WHERE (q.status='pending' OR (q.status='sending' AND q.lease_until<clock_timestamp())) AND q.next_attempt_at<=clock_timestamp() AND q.attempt_count<5
   ORDER BY q.next_attempt_at, q.id LIMIT LEAST(GREATEST(coalesce(p_limit,20),1),50) FOR UPDATE SKIP LOCKED
 ), leased AS (
  UPDATE public.customer_notice_emails q SET status='sending', attempt_count=q.attempt_count+1, lease_until=clock_timestamp()+interval '10 minutes'
    FROM picked WHERE q.id=picked.id RETURNING q.*
 )
 SELECT l.id, l.organization_id, l.kind, l.email_type, l.to_email, l.to_name, l.subject, l.body_text, l.reply_to, l.sender_name FROM leased l;
END $function$;
REVOKE ALL ON FUNCTION public.claim_customer_notice_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_notice_emails(integer) TO service_role;

COMMIT;
