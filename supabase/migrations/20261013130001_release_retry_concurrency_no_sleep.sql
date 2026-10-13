-- 現行の本番/staging定義一致を確認。並行した別DB変更を上書きしない。
DO $preflight$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_private_group_browser_write' AND md5(p.prosrc) IN ('f271968e8d8776249c3ddb197da3c38d','63e800054a39ac943a2e4d19f00c479b')) THEN RAISE EXCEPTION '対象関数の現行定義が変わっています: guard_private_group_browser_write'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_withdrawn_private_group_response' AND md5(p.prosrc) IN ('f0ee74b7475ec21e7639aff4ca2704fc','e176902a5f68c6e2b1da0a7ce2e32a53')) THEN RAISE EXCEPTION '対象関数の現行定義が変わっています: guard_withdrawn_private_group_response'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='private_group_member_action' AND md5(p.prosrc) IN ('8a4137e9d4d175376f85a3b7e3cf0273','99f722252ef3fde05ff9650a2a85c7cc')) THEN RAISE EXCEPTION '対象関数の現行定義が変わっています: private_group_member_action'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_event_staff_participations' AND md5(p.prosrc) IN ('44a3eab81d7414dc04c3b6c2e9101411','6463a87b2778f78f6a06b22ea3f3a18c')) THEN RAISE EXCEPTION '対象関数の現行定義が変わっています: sync_event_staff_participations'; END IF;
END $preflight$;

-- 現行本番定義を基点に接続を占有するsleepのみ除去。日程の無効要素スキップを保持。
CREATE OR REPLACE FUNCTION public.guard_private_group_browser_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_group uuid; v_manager text; v_owner boolean; v_message jsonb; v_cap integer;
BEGIN
BEGIN
 -- Definer RPCs validate their own actor. Ordinary browser writes run as anon/authenticated.
 IF current_user NOT IN ('anon','authenticated') THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '本人確認が必要です。招待ページから入り直してください' USING ERRCODE='42501'; END IF;
 v_row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_group:=(v_row->>'group_id')::uuid;
 IF TG_OP='UPDATE' AND (NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
  RAISE EXCEPTION '所属先・識別子を変更できません' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM private_groups WHERE id=v_group FOR UPDATE;
 v_manager:=public.private_group_actor_role(v_group);
 IF TG_TABLE_NAME='private_group_members' THEN
  IF TG_OP<>'DELETE' AND NEW.status='joined' THEN
   SELECT s.player_count_max INTO v_cap FROM private_groups g JOIN organization_scenarios_with_master s ON s.organization_id=g.organization_id AND s.scenario_master_id=g.scenario_master_id WHERE g.id=v_group;
   IF v_cap IS NULL OR (SELECT count(*) FROM private_group_members WHERE group_id=v_group AND status='joined' AND id<>NEW.id)>=v_cap THEN
    RAISE EXCEPTION '参加人数が上限に達しています' USING ERRCODE='23514';
   END IF;
  END IF;
  IF TG_OP='INSERT' THEN
   -- The only direct insert left is the creator becoming the organizer. Joins use the atomic RPC.
   IF NOT EXISTS(SELECT 1 FROM private_groups WHERE id=v_group AND organizer_id=auth.uid()) OR NEW.user_id IS DISTINCT FROM auth.uid() OR NOT NEW.is_organizer
    OR EXISTS(SELECT 1 FROM private_group_members WHERE group_id=v_group AND is_organizer)
    OR NEW.coupon_id IS NOT NULL OR coalesce(NEW.coupon_discount,0)<>0 OR NEW.payment_status='paid' THEN
    RAISE EXCEPTION '招待ページから参加してください' USING ERRCODE='42501';
   END IF;
  ELSIF TG_OP='UPDATE' THEN
   IF v_manager IS DISTINCT FROM 'staff' THEN RAISE EXCEPTION '参加者情報の変更権限がありません' USING ERRCODE='42501'; END IF;
   IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_organizer IS DISTINCT FROM OLD.is_organizer THEN RAISE EXCEPTION '本人情報を変更できません' USING ERRCODE='42501'; END IF;
  ELSE
   IF (OLD.is_organizer AND v_manager IS DISTINCT FROM 'staff') OR (v_manager IS NULL AND OLD.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION '退出・削除の権限がありません' USING ERRCODE='42501'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='private_group_candidate_dates' THEN
  IF v_manager IS NULL THEN RAISE EXCEPTION '候補日を変更する権限がありません' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT EXISTS(SELECT 1 FROM private_group_members WHERE id=(v_row->>'member_id')::uuid AND group_id=v_group AND user_id=auth.uid() AND status='joined') INTO v_owner;
  IF TG_OP='UPDATE' AND NEW.member_id IS DISTINCT FROM OLD.member_id THEN RAISE EXCEPTION '回答者・送信者を変更できません' USING ERRCODE='42501'; END IF;
  IF NOT v_owner AND v_manager IS NULL THEN RAISE EXCEPTION '本人の参加情報が必要です' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='private_group_date_responses' THEN
   IF TG_OP<>'DELETE' AND NOT v_owner THEN RAISE EXCEPTION '本人の日程回答だけ変更できます' USING ERRCODE='42501'; END IF;
   IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE id=NEW.candidate_date_id AND group_id=v_group) THEN RAISE EXCEPTION '別グループの日程には回答できません' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='private_group_messages' THEN
   IF TG_OP<>'DELETE' AND v_manager IS NULL AND NEW.message ~ '^\s*\{' THEN
    BEGIN
     v_message:=NEW.message::jsonb;
     IF v_message->>'type'='system' THEN RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE='42501'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
   END IF;
   IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM private_group_members WHERE id=NEW.member_id AND group_id=v_group) AND NEW.member_id IS NOT NULL THEN RAISE EXCEPTION '別グループの送信者です' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='private_group_survey_responses' THEN
   IF TG_OP<>'DELETE' AND NOT v_owner AND v_manager IS DISTINCT FROM 'staff' THEN RAISE EXCEPTION '本人の回答だけ変更できます' USING ERRCODE='42501'; END IF;
   IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM private_group_members WHERE id=NEW.member_id AND group_id=v_group) THEN RAISE EXCEPTION '別グループの回答者です' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_withdrawn_private_group_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE withdrawn timestamptz;
BEGIN
  PERFORM 1 FROM public.private_groups WHERE id=NEW.group_id FOR SHARE NOWAIT;
  SELECT withdrawn_at INTO withdrawn FROM public.private_group_candidate_dates
    WHERE id=NEW.candidate_date_id AND group_id=NEW.group_id FOR SHARE NOWAIT;
  IF withdrawn IS NOT NULL THEN
    RAISE EXCEPTION '候補日が削除されています。画面を更新してから回答してください' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION '候補日が更新中です。画面を更新してから回答してください' USING ERRCODE='40001';
END $function$
;

CREATE OR REPLACE FUNCTION public.private_group_member_action(p_group_id uuid, p_member_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_result uuid; v_message text; v_leaving private_group_members%ROWTYPE; v_name text; v_before integer;
BEGIN
BEGIN
 -- Lock the group before the member, consistently with join and future membership guards.
 PERFORM 1 FROM private_groups WHERE id=p_group_id FOR UPDATE;
 PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
 IF p_payload IS NULL OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023'; END IF;
 CASE p_action
 WHEN 'validate' THEN RETURN jsonb_build_object('valid',true);
 WHEN 'date_responses' THEN
  IF jsonb_typeof(p_payload)<>'array' OR jsonb_array_length(p_payload)>100 THEN RAISE EXCEPTION '日程回答が不正です' USING ERRCODE='22023'; END IF;
  -- 2026-10-13 恒久対応: 古い版の画面が、取り下げ済み・存在しない候補日を含む内容を即座に再送し続けた。
  -- 無効な要素（別グループ・存在しない・取り下げ済み・不採用の候補日、不正な回答値）はエラーにせず飛ばし、
  -- 有効なものだけ保存して成功を返す（全部飛ばした場合も成功）。配列でない／100 件超は従来どおりエラー。
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload) LOOP
   CONTINUE WHEN jsonb_typeof(v_row) IS DISTINCT FROM 'object';
   CONTINUE WHEN coalesce(v_row->>'response','') NOT IN ('ok','ng','maybe');
   CONTINUE WHEN coalesce(v_row->>'candidateDateId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
   CONTINUE WHEN NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE id=(v_row->>'candidateDateId')::uuid AND group_id=p_group_id
     AND withdrawn_at IS NULL AND coalesce(status,'active')<>'rejected');
   INSERT INTO private_group_date_responses(group_id,member_id,candidate_date_id,response)
   VALUES(p_group_id,p_member_id,(v_row->>'candidateDateId')::uuid,v_row->>'response')
   ON CONFLICT(member_id,candidate_date_id) DO UPDATE SET response=EXCLUDED.response,updated_at=clock_timestamp();
  END LOOP;
  RETURN 'true'::jsonb;
 WHEN 'message' THEN
  v_message:=trim(p_payload->>'message');
  IF v_message IS NULL OR length(v_message)=0 OR length(v_message)>5000 THEN RAISE EXCEPTION 'メッセージは1〜5000文字で入力してください' USING ERRCODE='22023'; END IF;
  -- Guest/member messages are plain text, never impersonated system announcements.
  IF v_message ~ '^\s*\{' THEN
   BEGIN
    IF (v_message::jsonb)->>'type'='system' THEN RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE='42501'; END IF;
   EXCEPTION WHEN invalid_text_representation THEN NULL;
   END;
  END IF;
  INSERT INTO private_group_messages(group_id,member_id,message) VALUES(p_group_id,p_member_id,v_message) RETURNING id INTO v_result;
  RETURN to_jsonb(v_result);
 WHEN 'survey_read' THEN RETURN public.get_survey_data_for_member(p_group_id,p_member_id);
 WHEN 'survey_write' THEN
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'アンケート回答が不正です' USING ERRCODE='22023'; END IF;
  RETURN to_jsonb(public.upsert_survey_response_for_member(p_group_id,p_member_id,p_payload));
 WHEN 'character_preference' THEN
  IF length(coalesce(p_payload->>'characterId',''))>200 THEN RAISE EXCEPTION '配役希望が不正です' USING ERRCODE='22023'; END IF;
  PERFORM public.set_character_preference(p_group_id,p_member_id::text,p_payload->>'characterId');
  RETURN 'true'::jsonb;
 WHEN 'leave' THEN
  IF EXISTS(SELECT 1 FROM private_group_members WHERE id=p_member_id AND is_organizer) THEN RAISE EXCEPTION '主催者は退出できません' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_leaving FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id;
  SELECT count(*) INTO v_before FROM private_group_members WHERE group_id=p_group_id AND status='joined';
  v_name:=CASE WHEN v_leaving.user_id IS NULL THEN nullif(btrim(v_leaving.guest_name),'') ELSE coalesce(
    (SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM customers c WHERE c.user_id=v_leaving.user_id ORDER BY c.id LIMIT 1),
    nullif(btrim(v_leaving.guest_name),'')) END;
  DELETE FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id;
  -- 申込後・確定後は店舗へ人数変更として知らせる（段階 2 の「外す」と同じ経路）
  IF v_leaving.status='joined' THEN
   PERFORM public.private_group_queue_member_left_notice(p_group_id,v_before,v_before-1,v_name,p_member_id);
  END IF;
  RETURN 'true'::jsonb;
 ELSE RAISE EXCEPTION '未対応の操作です' USING ERRCODE='22023';
 END CASE;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
END $function$
;

CREATE OR REPLACE FUNCTION public.sync_event_staff_participations(p_event_id uuid, p_entries jsonb, p_expected jsonb, p_gms text[], p_gm_roles jsonb, p_expected_staff jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_org uuid:=public.get_user_organization_id(); v_event public.schedule_events; v_current jsonb; v_entry jsonb;
 v_staff public.staff; v_res public.reservations; v_id uuid; v_name text; v_total integer; v_limit integer; v_new_count integer; v_old record; v_after jsonb; v_actor_id uuid; v_actor_name text;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin')) THEN
  RAISE EXCEPTION 'スタッフ参加を保存する権限がありません' USING ERRCODE='42501';
 END IF;
 -- APIインスタンスをまたぐ並列保存もDB接続を待機させず拒否する。
 IF NOT pg_try_advisory_xact_lock(hashtextextended('mmq-staff-write:'||auth.uid()::text||':'||p_event_id::text,0)) THEN
  RAISE EXCEPTION 'スタッフ参加が保存中です。少し待って公演を開き直してください' USING ERRCODE='55P03';
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
WHEN OTHERS THEN
 RAISE;
END $function$
;
