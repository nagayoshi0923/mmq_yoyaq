-- 通知の同時送信を避け、通信断後は同じ冪等性キーで再試行する。
CREATE OR REPLACE FUNCTION public.claim_performance_recruitment_notices() RETURNS SETOF public.performance_recruitment_notices
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE performance_recruitment_notices n SET status='sending', attempts=attempts+1, lease_until=now()+interval '5 minutes'
 WHERE id IN (SELECT q.id FROM performance_recruitment_notices q
   JOIN performance_recruitment_deadlines d ON d.schedule_event_id=q.schedule_event_id AND d.organization_id=q.organization_id
   WHERE (q.status IN ('pending','failed') OR (q.status='sending' AND q.lease_until<now()))
     AND (q.lease_until IS NULL OR q.lease_until<now()) AND q.attempts<10
     AND (q.kind='withdrawn' OR q.cycle=d.cycle)
     AND ((q.kind='extension' AND d.status='active' AND d.deadline>now() AND q.withdrawn_at IS NULL)
       OR (q.kind IN ('confirmed','cancelled') AND d.status=q.kind AND q.created_at>now()-interval '1 day')
       OR (q.kind='withdrawn' AND q.created_at>now()-interval '1 day'))
   ORDER BY q.created_at LIMIT 25 FOR UPDATE OF q SKIP LOCKED)
 RETURNING n.*;
$$;
REVOKE ALL ON FUNCTION public.claim_performance_recruitment_notices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_performance_recruitment_notices() TO service_role;

-- メール内の推測不能な専用トークンだけで利用する。GETでは予約を変更しない。
CREATE OR REPLACE FUNCTION public.respond_to_performance_recruitment(p_token uuid,p_withdraw boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.respond_to_performance_recruitment_v2(p_token,p_withdraw,NULL,NULL,NULL);
$$;
REVOKE ALL ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) TO service_role;
