-- 承認RPCの所有者からだけ呼び出す。ブラウザやワーカーは配送を追加できない。
CREATE OR REPLACE FUNCTION public.enqueue_private_approval_deliveries(p_request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE
 receipt public.private_booking_approval_requests%ROWTYPE;
 r public.reservations%ROWTYPE; e public.schedule_events%ROWTYPE; s public.staff%ROWTYPE;
 booking jsonb; gm_ids uuid[]; gm_id uuid; recipient text; recipient_name text; job_count integer;
 store_name text; store_address text;
 actor_staff_id uuid; actor_name text; event_snapshot jsonb;
BEGIN
 SELECT * INTO STRICT receipt FROM public.private_booking_approval_requests WHERE id=p_request_id;
 SELECT * INTO STRICT r FROM public.reservations WHERE id=receipt.reservation_id AND organization_id=receipt.organization_id;
 SELECT * INTO STRICT e FROM public.schedule_events
  WHERE id=(receipt.result->>'schedule_event_id')::uuid AND organization_id=receipt.organization_id;
 IF r.schedule_event_id IS DISTINCT FROM e.id OR e.is_cancelled IS DISTINCT FROM false
  OR r.status NOT IN ('confirmed','gm_confirmed') THEN
  RAISE EXCEPTION 'APPROVAL_NOTIFICATION_NOT_CURRENT' USING ERRCODE='22023';
 END IF;
 SELECT name,address INTO STRICT store_name,store_address FROM public.stores
  WHERE id=e.store_id AND organization_id=receipt.organization_id;
 recipient:=nullif(btrim(r.customer_email),''); recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
 IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
  SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name
   FROM public.customers c WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
 END IF;
 booking:=jsonb_build_object(
  'reservationId',r.id,'organizationId',r.organization_id,'scheduleEventId',e.id,'storeId',e.store_id,
  'scenarioMasterId',coalesce(e.scenario_master_id,r.scenario_master_id),'scenarioTitle',coalesce(nullif(e.scenario,''),r.scenario_title,''),
  'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,'storeName',store_name,'storeAddress',store_address,
  'customerEmail',recipient,'customerName',coalesce(recipient_name,'お客様'),'participantCount',r.participant_count,
  'totalPrice',coalesce(r.final_price,r.total_price,0),'reservationNumber',r.reservation_number,'notes',r.customer_notes,
  'groupId',r.private_group_id,'eventGms',to_jsonb(e.gms));
 INSERT INTO public.private_booking_approval_deliveries(request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
 VALUES(receipt.id,r.organization_id,r.id,e.id,'confirmation_email','customer',booking);
 gm_ids:=array_remove(ARRAY[(receipt.request_payload->>'gm')::uuid,(receipt.request_payload->>'sub_gm')::uuid],NULL);
 FOR gm_id IN SELECT DISTINCT unnest(gm_ids) LOOP
  SELECT * INTO STRICT s FROM public.staff WHERE id=gm_id AND organization_id=r.organization_id AND status='active';
  IF NOT coalesce(s.name=ANY(e.gms),false) THEN RAISE EXCEPTION 'APPROVAL_GM_NOT_ASSIGNED' USING ERRCODE='22023'; END IF;
  INSERT INTO public.private_booking_approval_deliveries(request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
  SELECT receipt.id,r.organization_id,r.id,e.id,kind,s.id::text,
   booking||jsonb_build_object('gmId',s.id,'gmName',s.name,'gmEmail',nullif(btrim(s.email),''),
    'gmDiscordChannelId',nullif(btrim(s.discord_channel_id),''),'gmDiscordUserId',nullif(btrim(s.discord_user_id),''))
  FROM unnest(ARRAY['gm_email','gm_discord']) AS kind;
 END LOOP;
 SELECT id,name INTO actor_staff_id,actor_name FROM public.staff
  WHERE user_id=receipt.actor_id AND organization_id=r.organization_id AND status='active';
 SELECT jsonb_object_agg(key,value) INTO event_snapshot FROM jsonb_each(to_jsonb(e))
  WHERE key IN ('id','organization_id','date','venue','store_id','scenario','scenario_master_id','gms','gm_roles',
   'start_time','end_time','category','capacity','max_participants','current_participants','notes','is_cancelled',
   'is_tentative','is_reservation_enabled','is_private_request','reservation_name','time_slot','venue_rental_fee');
 INSERT INTO public.schedule_event_history(schedule_event_id,organization_id,event_date,store_id,time_slot,
  changed_by_user_id,changed_by_staff_id,changed_by_name,action_type,new_values,notes)
 VALUES(e.id,r.organization_id,e.date,e.store_id,e.time_slot,receipt.actor_id,actor_staff_id,
  coalesce(actor_name,'管理者')||'（貸切管理）','create',event_snapshot,'貸切予約承認により作成');
 SELECT count(*) INTO job_count FROM public.private_booking_approval_deliveries WHERE request_id=receipt.id;
 RETURN job_count;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_private_approval_deliveries(uuid) FROM PUBLIC,anon,authenticated,service_role;
