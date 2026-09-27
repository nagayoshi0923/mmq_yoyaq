CREATE OR REPLACE FUNCTION public.approve_private_booking_with_delivery(
 p_request_id uuid,p_reservation_id uuid,p_selected_date date,p_selected_start_time time,p_selected_end_time time,
 p_selected_store_id uuid,p_selected_gm_id uuid,p_candidate_datetimes jsonb,p_scenario_title text,
 p_customer_name text,p_selected_sub_gm_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE
 r public.reservations%ROWTYPE; receipt public.private_booking_approval_requests%ROWTYPE;
 payload jsonb; result jsonb; recipient text; recipient_name text; message_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.get_user_organization_id() IS DISTINCT FROM r.organization_id
  OR NOT coalesce(public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=r.organization_id AND s.status='active'),false) THEN
  RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
 END IF;
 payload:=jsonb_build_object('reservation',p_reservation_id,'date',p_selected_date,'start',p_selected_start_time,'end',p_selected_end_time,
  'store',p_selected_store_id,'gm',p_selected_gm_id,'sub_gm',p_selected_sub_gm_id,'candidates',p_candidate_datetimes,'title',p_scenario_title,'customer_name',p_customer_name);
 SELECT * INTO receipt FROM public.private_booking_approval_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF receipt.organization_id IS DISTINCT FROM r.organization_id OR receipt.reservation_id IS DISTINCT FROM r.id
   OR receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.request_payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION 'APPROVAL_REQUEST_CONFLICT' USING ERRCODE='22023';
  END IF;
  RETURN receipt.result||jsonb_build_object('replayed',true);
 END IF;
 result:=public.approve_private_booking_with_notice(p_reservation_id,p_selected_date,p_selected_start_time,
  p_selected_end_time,p_selected_store_id,p_selected_gm_id,p_candidate_datetimes,p_scenario_title,p_customer_name,p_selected_sub_gm_id);
 SELECT * INTO STRICT r FROM public.reservations WHERE id=p_reservation_id;
 message_id:=(result->>'survey_message_id')::uuid;
 IF result->>'survey_notice' IS NOT NULL THEN
  IF message_id IS NULL OR r.private_group_id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOTICE_MISSING' USING ERRCODE='22023'; END IF;
  recipient:=nullif(btrim(r.customer_email),'');recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
  IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
   SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name FROM public.customers c
    WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
  END IF;
  INSERT INTO public.private_group_survey_deliveries(id,organization_id,group_id,reservation_id,schedule_event_id,actor_id,source,message_id,customer_email,customer_name,subject,message_body)
  VALUES(p_request_id,r.organization_id,r.private_group_id,r.id,(result->>'schedule_event_id')::uuid,auth.uid(),'approval',message_id,recipient,coalesce(recipient_name,'お客様'),'【事前配役アンケートのご案内】',result->>'survey_notice');
  result:=result||jsonb_build_object('survey_delivery_id',p_request_id,'survey_delivery_status','pending');
 END IF;
 -- 旧ブラウザはsurvey_noticeを直接送信するため、新入口では本文を返さない。
 result:=(result-'survey_notice'-'survey_message_id')||jsonb_build_object('replayed',false);
 INSERT INTO public.private_booking_approval_requests(id,organization_id,reservation_id,actor_id,request_payload,result)
 VALUES(p_request_id,r.organization_id,r.id,auth.uid(),payload,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated,service_role;
