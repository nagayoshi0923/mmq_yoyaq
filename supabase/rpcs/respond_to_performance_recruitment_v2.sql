CREATE FUNCTION public.respond_to_performance_recruitment_v2(p_token uuid,p_withdraw boolean DEFAULT false,p_count integer DEFAULT NULL,p_request_id uuid DEFAULT NULL,p_expected_count integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n performance_recruitment_notices%ROWTYPE; d performance_recruitment_deadlines%ROWTYPE; e schedule_events%ROWTYPE; r reservations%ROWTYPE;
 w performance_recruitment_withdrawals%ROWTYPE; v_count integer; v_remaining integer; v_request uuid; v_sequence integer; v_result jsonb; v_paid boolean; v_unit integer;
BEGIN
 SELECT * INTO n FROM performance_recruitment_notices WHERE response_token=p_token AND kind='extension';
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','INVALID_LINK'); END IF;
 SELECT * INTO e FROM schedule_events WHERE id=n.schedule_event_id AND organization_id=n.organization_id FOR UPDATE;
 SELECT * INTO r FROM reservations WHERE id=n.reservation_id AND organization_id=n.organization_id AND schedule_event_id=n.schedule_event_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','INVALID_LINK'); END IF;
 SELECT * INTO n FROM performance_recruitment_notices WHERE id=n.id FOR UPDATE;
 SELECT * INTO d FROM performance_recruitment_deadlines WHERE schedule_event_id=e.id AND organization_id=e.organization_id;
 v_request:=COALESCE(p_request_id,n.id);
 IF p_withdraw THEN
  SELECT * INTO w FROM performance_recruitment_withdrawals WHERE request_id=v_request;
  IF FOUND THEN
   IF w.notice_id<>n.id OR (p_count IS NOT NULL AND w.withdrawn_count<>p_count) THEN RETURN jsonb_build_object('success',false,'error','REQUEST_CONFLICT'); END IF;
   RETURN w.result;
  END IF;
 END IF;
 IF n.withdrawn_at IS NOT NULL THEN RETURN jsonb_build_object('success',true,'status','withdrawn','participant_count',0,'cancellation_fee',0,'event',n.snapshot); END IF;
 v_paid:=COALESCE(r.payment_status,'pending') NOT IN ('pending','unpaid');
 IF p_withdraw THEN
  IF n.cycle<>d.cycle OR d.status IS DISTINCT FROM 'active' OR now()>=d.deadline OR e.is_cancelled OR r.status NOT IN ('pending','confirmed','gm_confirmed') THEN RETURN jsonb_build_object('success',false,'error','WITHDRAWAL_CLOSED'); END IF;
  IF v_paid THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_REVIEW_REQUIRED'); END IF;
  IF p_expected_count IS NOT NULL AND p_expected_count<>r.participant_count THEN RETURN jsonb_build_object('success',false,'error','PARTICIPANT_COUNT_CHANGED'); END IF;
  v_count:=COALESCE(p_count,r.participant_count);
  IF v_count<1 OR v_count>r.participant_count THEN RETURN jsonb_build_object('success',false,'error','INVALID_COUNT'); END IF;
  v_remaining:=r.participant_count-v_count;
  IF v_remaining>0 AND (COALESCE(r.discount_amount,0)<>0 OR COALESCE(r.total_price,0)%r.participant_count<>0) THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_REVIEW_REQUIRED'); END IF;
  v_unit:=COALESCE(r.total_price,0)/r.participant_count;
  IF v_remaining=0 THEN
   UPDATE reservations SET status='cancelled',cancelled_at=now(),cancellation_reason='追加募集の開催判断待ちによる無料辞退（キャンセル料0円）',updated_at=now() WHERE id=r.id AND organization_id=n.organization_id;
   UPDATE performance_recruitment_notices SET withdrawn_at=now() WHERE id=n.id AND organization_id=n.organization_id;
  ELSE
   UPDATE reservations SET participant_count=v_remaining,
    total_price=v_unit*v_remaining,final_price=v_unit*v_remaining,
    cancellation_reason=format('追加募集の開催判断待ちに%s名無料辞退、%s名の予約を維持',v_count,v_remaining),updated_at=now()
    WHERE id=r.id AND organization_id=n.organization_id;
  END IF;
  v_result:=jsonb_build_object('success',true,'status',CASE WHEN v_remaining=0 THEN 'withdrawn' ELSE d.status END,'participant_count',v_remaining,
    'withdrawn_count',v_count,'cancellation_fee',0,'event',n.snapshot,'can_withdraw',v_remaining>0);
  INSERT INTO performance_recruitment_withdrawals(request_id,organization_id,schedule_event_id,reservation_id,notice_id,withdrawn_count,remaining_count,result)
    VALUES(v_request,n.organization_id,e.id,r.id,n.id,v_count,v_remaining,v_result);
  SELECT count(*) INTO v_sequence FROM performance_recruitment_withdrawals WHERE notice_id=n.id AND organization_id=n.organization_id;
  INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,kind,cycle,withdrawal_sequence)
    VALUES(e.id,n.organization_id,r.id,n.customer_email,n.snapshot||jsonb_build_object('withdrawn_count',v_count,'remaining_count',v_remaining),'withdrawn',n.cycle,v_sequence);
  UPDATE schedule_events SET current_participants=(SELECT COALESCE(sum(participant_count),0) FROM reservations WHERE schedule_event_id=e.id AND organization_id=e.organization_id AND status IN ('pending','confirmed','gm_confirmed','checked_in')),updated_at=now() WHERE id=e.id AND organization_id=e.organization_id;
  RETURN v_result;
 END IF;
 RETURN jsonb_build_object('success',true,'status',d.status,'event',n.snapshot,'participant_count',r.participant_count,'payment_review_required',v_paid,
 'can_withdraw',n.cycle=d.cycle AND d.status='active' AND now()<d.deadline AND NOT e.is_cancelled AND r.status IN ('pending','confirmed','gm_confirmed'));
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_performance_recruitment_v2(uuid,boolean,integer,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_performance_recruitment_v2(uuid,boolean,integer,uuid,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.respond_to_performance_recruitment(p_token uuid,p_withdraw boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.respond_to_performance_recruitment_v2(p_token,p_withdraw,NULL,NULL,NULL);
$$;
REVOKE ALL ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) TO service_role;
