-- お知らせメールの取り出し（claim_customer_notice_emails）に「この ID だけ」を指定できる任意引数 p_only_ids を足す（2026-10-21）。
-- Codex 第 2 回再レビュー R1: 本番公開の限定試験で「ほかの送信待ちの時刻を後ろへずらす」方式は、
--   送信処理の取り出しが遅れる・ずらした後に新しく積まれる・期限切れの sending を拾い直す、のどれかで試験相手以外にも送れた。
--   取り出しの段階で ID を限定すれば、ほかの行の状態に関係なく試験の行だけが取り出される。
-- 引数なし（定期実行・既定）の動きは変えない。p_only_ids に空の配列を渡したときは何も取り出さない（「全部」にはしない）。
-- 旧版 claim_customer_notice_emails(integer) は消して作り直す（2 つ並ぶと p_limit だけの呼び出しがどちらか決まらなくなるため）。
-- 戻し方: supabase/rollbacks/20261021120000_customer_notice_claim_only_ids.sql（旧版の本文に戻す）。
BEGIN;

DROP FUNCTION IF EXISTS public.claim_customer_notice_emails(integer);

CREATE OR REPLACE FUNCTION public.claim_customer_notice_emails(p_limit integer DEFAULT 20, p_only_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(id uuid, organization_id uuid, kind text, email_type text, to_email text, to_name text, subject text, body_text text,
  reply_to text, sender_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='customer_notice_email' AND value='on') THEN RETURN; END IF;
 IF p_only_ids IS NOT NULL AND coalesce(cardinality(p_only_ids),0)=0 THEN RETURN; END IF;
 RETURN QUERY
 WITH picked AS (
  SELECT q.id FROM public.customer_notice_emails q
   WHERE (q.status='pending' OR (q.status='sending' AND q.lease_until<clock_timestamp())) AND q.next_attempt_at<=clock_timestamp() AND q.attempt_count<5
     AND (p_only_ids IS NULL OR q.id=ANY(p_only_ids))
   ORDER BY q.next_attempt_at, q.id LIMIT LEAST(GREATEST(coalesce(p_limit,20),1),50) FOR UPDATE SKIP LOCKED
 ), leased AS (
  UPDATE public.customer_notice_emails q SET status='sending', attempt_count=q.attempt_count+1, lease_until=clock_timestamp()+interval '10 minutes'
    FROM picked WHERE q.id=picked.id RETURNING q.*
 )
 SELECT l.id, l.organization_id, l.kind, l.email_type, l.to_email, l.to_name, l.subject, l.body_text, l.reply_to, l.sender_name FROM leased l;
END $function$;
REVOKE ALL ON FUNCTION public.claim_customer_notice_emails(integer, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_notice_emails(integer, uuid[]) TO service_role;

COMMIT;
