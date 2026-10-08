-- 20261009130000 の取り消し: private_group_handover_detail を 20261009120000 の定義（ニックネームだけ）へ戻す
BEGIN;

CREATE OR REPLACE FUNCTION public.private_group_handover_detail(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE h public.private_group_handover_requests%ROWTYPE; g public.private_groups%ROWTYPE; res public.reservations%ROWTYPE;
 has_res boolean:=false; v_reservation jsonb; v_members jsonb; v_dates jsonb; v_scenario jsonb; v_contact jsonb; v_confirmed jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id;
 IF NOT FOUND OR NOT (auth.uid() IN (h.from_user_id,h.to_user_id) OR public.reservation_actor_is_org_operator(h.organization_id)) THEN
  RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501';
 END IF;
 PERFORM public.private_group_handover_settle(h.group_id);
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id;
 SELECT * INTO g FROM public.private_groups WHERE id=h.group_id;
 SELECT jsonb_build_object('title',s.title,'key_visual_url',s.key_visual_url) INTO v_scenario FROM public.scenario_masters s WHERE s.id=g.scenario_master_id;
 SELECT * INTO res FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 has_res:=FOUND;
 IF has_res THEN
  SELECT jsonb_build_object('date',e.date,'start_time',e.start_time,'end_time',e.end_time,'store_id',e.store_id,'store_name',COALESCE(s.name,e.venue))
   INTO v_confirmed
  FROM public.schedule_events e LEFT JOIN public.stores s ON s.id=e.store_id AND s.organization_id=g.organization_id
  WHERE e.id=res.schedule_event_id AND e.organization_id=g.organization_id AND res.status IN ('confirmed','checked_in','completed') AND NOT COALESCE(e.is_cancelled,false);
  v_reservation:=jsonb_build_object('id',res.id,'reservation_number',res.reservation_number,'status',res.status,
   'participant_count',res.participant_count,'total_price',res.total_price,'customer_name',res.customer_name,'store_id',res.store_id,
   'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',c->>'date','startTime',c->>'startTime','endTime',c->>'endTime') ORDER BY ord)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(res.candidate_datetimes->'candidates')='array' THEN res.candidate_datetimes->'candidates' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(c,ord)),'[]'::jsonb),
   'requested_store_ids',COALESCE((SELECT jsonb_agg(st->>'storeId' ORDER BY ord)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(res.candidate_datetimes->'requestedStores')='array' THEN res.candidate_datetimes->'requestedStores' ELSE '[]'::jsonb END) WITH ORDINALITY AS u(st,ord)
     WHERE nullif(st->>'storeId','') IS NOT NULL),'[]'::jsonb),
   'confirmed',v_confirmed,
   'policy',CASE WHEN res.cancellation_policy_snapshot_version=1 AND res.cancellation_policy_store_id IS NOT NULL THEN jsonb_build_object(
     'version',res.cancellation_policy_snapshot_version,'store_id',res.cancellation_policy_store_id,
     'store_name',(SELECT s.name FROM public.stores s WHERE s.id=res.cancellation_policy_store_id AND s.organization_id=g.organization_id),
     'performance_type',res.cancellation_policy_performance_type,'deadline_hours',res.cancellation_policy_deadline_hours,
     'fees',res.cancellation_policy_fees,'fee_basis',res.cancellation_policy_fee_basis,'updated_at',res.cancellation_policy_updated_at) END);
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,
   'name',CASE WHEN m.user_id IS NULL THEN coalesce(nullif(btrim(m.guest_name),''),'ゲスト') ELSE coalesce((SELECT nullif(c.nickname,'') FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),nullif(btrim(m.guest_name),''),'メンバー') END,
   'is_organizer',m.is_organizer,'is_guest',m.user_id IS NULL,'is_me',m.user_id IS NOT NULL AND m.user_id=auth.uid()) ORDER BY m.is_organizer DESC,m.joined_at,m.id),'[]'::jsonb)
  INTO v_members FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined';
 SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d.date,'time_slot',d.time_slot,'start_time',d.start_time,'end_time',d.end_time) ORDER BY d.order_num,d.id),'[]'::jsonb)
  INTO v_dates FROM public.private_group_candidate_dates d WHERE d.group_id=g.id AND d.status IS DISTINCT FROM 'rejected' AND d.withdrawn_at IS NULL;
 IF auth.uid()=h.to_user_id THEN
  -- 連絡先の初期値（本人の顧客情報。共通〔組織なし〕かこのグループと同じ組織のもの）
  SELECT jsonb_build_object('name',c.name,'phone',c.phone,'email',coalesce(nullif(c.email,''),(SELECT u.email FROM auth.users u WHERE u.id=auth.uid())))
   INTO v_contact FROM public.customers c
   WHERE c.user_id=auth.uid() AND (c.organization_id IS NULL OR c.organization_id=g.organization_id)
   ORDER BY (c.organization_id IS NULL) DESC, c.updated_at DESC NULLS LAST, c.id LIMIT 1;
  IF v_contact IS NULL THEN
   v_contact:=jsonb_build_object('name',NULL,'phone',NULL,'email',(SELECT u.email FROM auth.users u WHERE u.id=auth.uid()));
  END IF;
 END IF;
 RETURN jsonb_build_object(
  'request',jsonb_build_object('id',h.id,'status',h.status,'requested_at',h.requested_at,'expires_at',h.expires_at,'responded_at',h.responded_at,
   'from_name',public.private_group_handover_user_name(h.from_user_id,g.id),'to_name',public.private_group_handover_user_name(h.to_user_id,g.id),
   'is_recipient',auth.uid()=h.to_user_id,'is_requester',auth.uid()=h.from_user_id),
  'group',jsonb_build_object('id',g.id,'status',g.status,'invite_code',g.invite_code,'organization_id',g.organization_id,
   'organization_slug',(SELECT o.slug FROM public.organizations o WHERE o.id=g.organization_id),
   'scenario_master_id',g.scenario_master_id,'preferred_store_ids',to_jsonb(g.preferred_store_ids),
   'total_price',g.total_price,'per_person_price',g.per_person_price,'target_participant_count',g.target_participant_count),
  'scenario',v_scenario,'reservation',v_reservation,'members',v_members,'candidate_dates',v_dates,'my_contact',v_contact);
END $function$;

COMMIT;
