BEGIN;
SET LOCAL lock_timeout='5s';
-- Explicit, operator-confirmed relationship; no name-based historical backfill.
CREATE TABLE public.event_staff_participations (
  event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK(mode IN ('included','additional')),
  PRIMARY KEY(event_id,staff_id)
);
CREATE UNIQUE INDEX event_staff_additional_reservation_unique ON public.event_staff_participations(reservation_id) WHERE mode='additional';
ALTER TABLE public.event_staff_participations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_staff_participations FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.event_staff_participations IS 'スタッフ参加が既存予約人数内か追加席かの明示記録。人物・過去予約の推測補完をしない。';
CREATE FUNCTION public.get_event_staff_participations(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_org uuid:=public.get_user_organization_id(); v_links jsonb; v_options jsonb; v_event public.schedule_events;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin'))
 OR NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org) THEN
  RAISE EXCEPTION 'この公演のスタッフ参加を確認する権限がありません' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_event FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org FOR SHARE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('staff_id',l.staff_id,'mode',l.mode,'reservation_id',l.reservation_id,
  'needs_confirmation',coalesce(r.id IS NULL OR r.schedule_event_id IS DISTINCT FROM l.event_id OR r.organization_id IS DISTINCT FROM l.organization_id
   OR r.status NOT IN ('pending','confirmed','gm_confirmed','checked_in') OR r.participant_count<1
   OR (l.mode='included' AND r.participant_count<(SELECT count(*) FROM public.event_staff_participations x WHERE x.reservation_id=l.reservation_id AND x.mode='included'))
   OR (l.mode='additional' AND (r.reservation_source IS DISTINCT FROM 'staff_entry' OR r.participant_count<>1 OR r.payment_method IS DISTINCT FROM 'staff' OR r.customer_id IS NOT NULL OR coalesce(r.base_price,0)<>0 OR coalesce(r.options_price,0)<>0 OR coalesce(r.discount_amount,0)<>0 OR coalesce(r.total_price,0)<>0 OR coalesce(r.final_price,0)<>0)),true)) ORDER BY l.staff_id),'[]') INTO v_links
 FROM public.event_staff_participations l LEFT JOIN public.reservations r ON r.id=l.reservation_id
 WHERE l.event_id=p_event_id AND l.organization_id=v_org;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',coalesce(nullif(r.customer_name,''),array_to_string(r.participant_names,'・'),r.reservation_number),
 'participant_count',r.participant_count,'reservation_number',r.reservation_number) ORDER BY r.created_at,r.id),'[]') INTO v_options
 FROM public.reservations r WHERE r.schedule_event_id=p_event_id AND r.organization_id=v_org AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')
 AND r.participant_count>0 AND NOT EXISTS(SELECT 1 FROM public.event_staff_participations l WHERE l.reservation_id=r.id AND l.mode='additional');
 RETURN jsonb_build_object('entries',v_links,'reservations',v_options,'assignment',jsonb_build_object('gms',coalesce(v_event.gms,ARRAY[]::text[]),'gm_roles',coalesce(v_event.gm_roles,'{}'::jsonb)));
END $$;
REVOKE ALL ON FUNCTION public.get_event_staff_participations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_event_staff_participations(uuid) TO authenticated,service_role;
CREATE FUNCTION public.sync_event_staff_participations(p_event_id uuid,p_entries jsonb,p_expected jsonb,p_gms text[],p_gm_roles jsonb,p_expected_staff jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_org uuid:=public.get_user_organization_id(); v_event public.schedule_events; v_current jsonb; v_entry jsonb;
 v_staff public.staff; v_res public.reservations; v_id uuid; v_name text; v_total integer; v_limit integer; v_new_count integer; v_old record; v_after jsonb; v_actor_id uuid; v_actor_name text;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin')) THEN
  RAISE EXCEPTION 'スタッフ参加を保存する権限がありません' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'スタッフ参加の形式が不正です' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_event FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org FOR NO KEY UPDATE;
 IF NOT FOUND OR v_event.is_cancelled THEN RAISE EXCEPTION '保存可能な公演が見つかりません' USING ERRCODE='22023'; END IF;
 v_current:=public.get_event_staff_participations(p_event_id)->'entries';
 IF v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'スタッフ参加が更新されました。公演を開き直してください' USING ERRCODE='40001'; END IF;
 IF jsonb_build_object('gms',coalesce(v_event.gms,ARRAY[]::text[]),'gm_roles',coalesce(v_event.gm_roles,'{}'::jsonb)) IS DISTINCT FROM p_expected_staff THEN
  RAISE EXCEPTION '担当スタッフが更新されました。公演を開き直してください' USING ERRCODE='40001';
 END IF;
 IF p_gms IS NULL OR jsonb_typeof(p_gm_roles) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '担当スタッフの形式が不正です' USING ERRCODE='22023'; END IF;
 UPDATE public.schedule_events SET gms=p_gms,gm_roles=p_gm_roles WHERE id=p_event_id AND organization_id=v_org;
 IF (SELECT count(*) FROM jsonb_array_elements(p_entries))<>(SELECT count(DISTINCT e->>'staff_id') FROM jsonb_array_elements(p_entries) e) THEN
  RAISE EXCEPTION '同じスタッフを重複して登録できません' USING ERRCODE='22023';
 END IF;
 -- Event roles and participant reservations are committed or rolled back together.
 IF EXISTS(SELECT 1 FROM public.schedule_event_staff_assignments a WHERE a.event_id=p_event_id AND a.role='staff'
  AND (a.staff_id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_entries) e WHERE e->>'staff_id'=a.staff_id::text))) THEN
  RAISE EXCEPTION 'スタッフ参加ごとに予約人数内か追加席かを選択してください' USING ERRCODE='22023';
 END IF;
 -- A reservation update may already hold a row lock while waiting for the event.
 -- NOWAIT prevents reversing that order into a deadlock; the entire call rolls back.
 PERFORM 1 FROM public.reservations WHERE schedule_event_id=p_event_id ORDER BY id FOR UPDATE NOWAIT;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
  SELECT * INTO v_staff FROM public.staff WHERE id=(v_entry->>'staff_id')::uuid AND organization_id=v_org;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.schedule_event_staff_assignments WHERE event_id=p_event_id AND staff_id=v_staff.id AND role='staff') THEN
   RAISE EXCEPTION '公演の参加スタッフを確認できません' USING ERRCODE='22023';
  END IF;
  IF v_entry->>'mode' NOT IN ('included','additional') OR v_entry->>'mode' IS NULL THEN
   RAISE EXCEPTION '予約人数内か追加席かを選択してください' USING ERRCODE='22023';
  END IF;
  IF v_entry->>'mode'='included' THEN
   SELECT * INTO v_res FROM public.reservations WHERE id=(v_entry->>'reservation_id')::uuid AND schedule_event_id=p_event_id AND organization_id=v_org AND status IN ('pending','confirmed','gm_confirmed','checked_in') AND participant_count>0;
   IF NOT FOUND OR EXISTS(SELECT 1 FROM public.event_staff_participations WHERE reservation_id=v_res.id AND mode='additional') THEN
    RAISE EXCEPTION '人数に含める有効な予約を選び直してください' USING ERRCODE='22023';
   END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(p_entries) e WHERE e->>'mode'='included' AND e->>'reservation_id'=v_res.id::text)>v_res.participant_count THEN
    RAISE EXCEPTION '予約人数を超えるスタッフを人数内として指定できません' USING ERRCODE='22023';
   END IF;
  ELSIF nullif(v_entry->>'reservation_id','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.event_staff_participations l JOIN public.reservations r ON r.id=l.reservation_id
   WHERE l.event_id=p_event_id AND l.staff_id=v_staff.id AND l.mode='additional' AND l.reservation_id=(v_entry->>'reservation_id')::uuid
    AND r.schedule_event_id=p_event_id AND r.organization_id=v_org AND r.reservation_source='staff_entry' AND r.participant_count=1
    AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')) THEN
   RAISE EXCEPTION '追加席が変更されています。公演を開き直してください' USING ERRCODE='40001';
  END IF;
 END LOOP;
 -- Only explicitly linked auto-created seats may be cancelled; all legacy/manual bookings are preserved.
 FOR v_old IN SELECT * FROM public.event_staff_participations WHERE event_id=p_event_id AND mode='additional' LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_entries) e WHERE e->>'staff_id'=v_old.staff_id::text AND e->>'mode'='additional' AND e->>'reservation_id'=v_old.reservation_id::text) THEN
   UPDATE public.reservations SET status='cancelled' WHERE id=v_old.reservation_id AND schedule_event_id=p_event_id AND organization_id=v_org
    AND reservation_source='staff_entry' AND participant_count=1 AND payment_method='staff' AND customer_id IS NULL AND coalesce(base_price,0)=0 AND coalesce(options_price,0)=0 AND coalesce(discount_amount,0)=0 AND coalesce(total_price,0)=0 AND coalesce(final_price,0)=0
    AND status IN ('pending','confirmed','gm_confirmed','checked_in');
   IF NOT FOUND AND EXISTS(SELECT 1 FROM public.reservations WHERE id=v_old.reservation_id AND status<>'cancelled')
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_current) e WHERE e->>'staff_id'=v_old.staff_id::text AND (e->>'needs_confirmation')::boolean) THEN
    RAISE EXCEPTION '追加席の予約内容が変更されています。予約者一覧を確認してください' USING ERRCODE='40001';
   END IF;
  END IF;
 END LOOP;
 SELECT coalesce(sum(participant_count),0) INTO v_total FROM public.reservations WHERE schedule_event_id=p_event_id AND organization_id=v_org AND status IN ('pending','confirmed','gm_confirmed','checked_in');
 v_new_count:=(SELECT count(*) FROM jsonb_array_elements(p_entries) e WHERE e->>'mode'='additional' AND nullif(e->>'reservation_id','') IS NULL);
 v_total:=v_total+v_new_count;
 v_limit:=coalesce(nullif(v_event.max_participants,0),nullif(v_event.capacity,0));
 IF v_new_count>0 AND (v_limit IS NULL OR v_limit<1 OR v_total>v_limit) THEN
  RAISE EXCEPTION '定員%名に対して%名になるため保存できません。予約人数に含まれるスタッフは「予約人数内」を選択してください',coalesce(v_limit,0),v_total USING ERRCODE='23514';
 END IF;
 DELETE FROM public.event_staff_participations WHERE event_id=p_event_id;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
  v_id:=nullif(v_entry->>'reservation_id','')::uuid;
  IF v_entry->>'mode'='additional' AND v_id IS NULL THEN
   SELECT name INTO v_name FROM public.staff WHERE id=(v_entry->>'staff_id')::uuid AND organization_id=v_org;
   INSERT INTO public.reservations(organization_id,schedule_event_id,reservation_number,title,scenario_master_id,store_id,customer_id,customer_notes,
    requested_datetime,duration,participant_count,participant_names,assigned_staff,base_price,options_price,total_price,discount_amount,final_price,payment_method,payment_status,status,reservation_source,created_by)
   VALUES(v_org,p_event_id,'STAFF-'||gen_random_uuid()::text,v_event.scenario,v_event.scenario_master_id,v_event.store_id,NULL,v_name,
    (v_event.date+v_event.start_time) AT TIME ZONE 'Asia/Tokyo',(extract(epoch FROM (v_event.end_time-v_event.start_time))/60+CASE WHEN v_event.end_time<=v_event.start_time THEN 1440 ELSE 0 END)::integer,
    1,ARRAY[v_name],ARRAY[]::text[],0,0,0,0,0,'staff','paid','confirmed','staff_entry',auth.uid()) RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.event_staff_participations VALUES(p_event_id,(v_entry->>'staff_id')::uuid,v_org,v_id,v_entry->>'mode');
 END LOOP;
 v_after:=public.get_event_staff_participations(p_event_id);
 IF v_after->'entries' IS DISTINCT FROM v_current OR v_after->'assignment' IS DISTINCT FROM p_expected_staff THEN
  INSERT INTO public.audit_logs(user_id,organization_id,action,resource_type,resource_id,old_values,new_values)
  VALUES(auth.uid(),v_org,'staff_participation.sync','schedule_events',p_event_id,jsonb_build_object('entries',v_current,'assignment',p_expected_staff),v_after-'reservations');
  SELECT id,name INTO v_actor_id,v_actor_name FROM public.staff WHERE user_id=auth.uid() AND organization_id=v_org;
  INSERT INTO public.schedule_event_history(schedule_event_id,organization_id,changed_by_user_id,changed_by_staff_id,changed_by_name,action_type,changes,old_values,new_values,event_date,store_id,time_slot,notes)
  SELECT p_event_id,v_org,auth.uid(),v_actor_id,coalesce(v_actor_name,'管理者'),'update',
   jsonb_build_object('gms',jsonb_build_object('old',p_expected_staff->'gms','new',to_jsonb(p_gms)),
    'gm_roles',jsonb_build_object('old',p_expected_staff->'gm_roles','new',p_gm_roles),
    'staff_participation',jsonb_build_object('old',v_current,'new',v_after->'entries')),
   to_jsonb(v_event),to_jsonb(e),e.date,e.store_id,e.time_slot,'担当とスタッフ参加人数を一括保存'
  FROM public.schedule_events e WHERE e.id=p_event_id;
 END IF;
 RETURN v_after;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION '予約が別の操作で更新中です。変更は保存されていません。再読み込みしてください' USING ERRCODE='55P03';
END $$;
REVOKE ALL ON FUNCTION public.sync_event_staff_participations(uuid,jsonb,jsonb,text[],jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_event_staff_participations(uuid,jsonb,jsonb,text[],jsonb,jsonb) TO authenticated,service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
