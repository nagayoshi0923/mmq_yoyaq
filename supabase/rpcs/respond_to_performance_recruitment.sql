-- 通知の同時送信を避け、通信断後は同じ冪等性キーで再試行する。
CREATE FUNCTION public.claim_performance_recruitment_notices() RETURNS SETOF public.performance_recruitment_notices
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE performance_recruitment_notices n SET status='sending', attempts=attempts+1, lease_until=now()+interval '5 minutes'
 WHERE id IN (SELECT q.id FROM performance_recruitment_notices q
   JOIN performance_recruitment_deadlines d ON d.schedule_event_id=q.schedule_event_id AND d.organization_id=q.organization_id
   WHERE (q.status IN ('pending','failed') OR (q.status='sending' AND q.lease_until<now()))
     AND (q.lease_until IS NULL OR q.lease_until<now()) AND q.attempts<10
     AND ((q.kind='extension' AND d.status='active' AND d.deadline>now() AND q.withdrawn_at IS NULL)
       OR (q.kind IN ('confirmed','cancelled') AND d.status=q.kind AND q.created_at>now()-interval '1 day')
       OR (q.kind='withdrawn' AND q.created_at>now()-interval '1 day'))
   ORDER BY q.created_at LIMIT 25 FOR UPDATE OF q SKIP LOCKED)
 RETURNING n.*;
$$;
REVOKE ALL ON FUNCTION public.claim_performance_recruitment_notices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_performance_recruitment_notices() TO service_role;

-- メール内の推測不能な専用トークンだけで利用する。GETでは予約を変更しない。
CREATE FUNCTION public.respond_to_performance_recruitment(p_token uuid, p_withdraw boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n performance_recruitment_notices%ROWTYPE; d performance_recruitment_deadlines%ROWTYPE; e schedule_events%ROWTYPE; r reservations%ROWTYPE;
BEGIN
 SELECT * INTO n FROM performance_recruitment_notices WHERE response_token=p_token AND kind='extension';
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','INVALID_LINK'); END IF;
 -- 判定処理とロック順を合わせる（公演→予約→通知）。
 SELECT * INTO e FROM schedule_events WHERE id=n.schedule_event_id AND organization_id=n.organization_id FOR UPDATE;
 SELECT * INTO r FROM reservations WHERE id=n.reservation_id AND organization_id=n.organization_id AND schedule_event_id=n.schedule_event_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','INVALID_LINK'); END IF;
 SELECT * INTO n FROM performance_recruitment_notices WHERE response_token=p_token AND kind='extension' FOR UPDATE;
 SELECT * INTO d FROM performance_recruitment_deadlines WHERE schedule_event_id=n.schedule_event_id AND organization_id=n.organization_id;
 IF n.withdrawn_at IS NOT NULL THEN RETURN jsonb_build_object('success',true,'status','withdrawn','cancellation_fee',0,'event',n.snapshot); END IF;
 IF p_withdraw THEN
   IF d.status IS DISTINCT FROM 'active' OR now()>=d.deadline OR e.is_cancelled OR r.status NOT IN ('pending','confirmed','gm_confirmed') THEN
     RETURN jsonb_build_object('success',false,'error','WITHDRAWAL_CLOSED');
   END IF;
   UPDATE reservations SET status='cancelled', cancelled_at=now(),
     cancellation_reason='追加募集の開催判断待ちによる無料辞退（キャンセル料0円）', updated_at=now()
     WHERE id=r.id AND organization_id=n.organization_id;
   UPDATE performance_recruitment_notices SET withdrawn_at=now() WHERE id=n.id;
   INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,kind)
     VALUES(n.schedule_event_id,n.organization_id,n.reservation_id,n.customer_email,n.snapshot,'withdrawn')
     ON CONFLICT(schedule_event_id,reservation_id,kind) DO NOTHING;
   UPDATE schedule_events SET current_participants=(SELECT COALESCE(sum(participant_count),0) FROM reservations
     WHERE schedule_event_id=e.id AND organization_id=e.organization_id AND status IN ('pending','confirmed','gm_confirmed','checked_in')),
     updated_at=now() WHERE id=e.id;
   RETURN jsonb_build_object('success',true,'status','withdrawn','cancellation_fee',0,'event',n.snapshot);
 END IF;
 RETURN jsonb_build_object('success',true,'status',d.status,'event',n.snapshot,
   'can_withdraw', d.status='active' AND now()<d.deadline AND NOT e.is_cancelled AND r.status IN ('pending','confirmed','gm_confirmed'));
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) TO service_role;
