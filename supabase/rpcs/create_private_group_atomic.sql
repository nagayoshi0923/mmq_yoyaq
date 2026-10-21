-- QW-20260917-001 A04: either the complete invitation group is created, or nothing is.
CREATE FUNCTION public.create_private_group_atomic(
 p_organization_id uuid,p_scenario_master_id uuid,p_name text DEFAULT NULL,
 p_preferred_store_ids uuid[] DEFAULT '{}',p_candidate_dates jsonb DEFAULT '[]',p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
 v_user uuid:=auth.uid(); v_group public.private_groups; v_member uuid;
 v_name text; v_settings public.global_settings; v_date jsonb; v_order bigint;
 v_custom_holidays jsonb; v_weekday_slots text[]; v_weekend_slots text[]; v_cand date; v_holiday boolean; v_allowed text[];
 v_slot text; v_start time; v_end time; v_store uuid; v_r text; v_rule text; v_busy text; v_ok boolean; v_single boolean;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_organization_id AND is_active IS TRUE) THEN
  RAISE EXCEPTION '組織情報が取得できません' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organization_scenarios_with_master
   WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id
   AND player_count_min>=1 AND player_count_max>=player_count_min AND accepts_private_booking IS TRUE) THEN
  RAISE EXCEPTION 'この作品は現在貸切を受け付けていません' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_preferred_store_ids,'{}')) s(id)
   WHERE NOT EXISTS(SELECT 1 FROM stores WHERE stores.id=s.id AND organization_id=p_organization_id AND status='active')) THEN
  RAISE EXCEPTION '選択した店舗はこの組織で利用できません' USING ERRCODE='22023';
 END IF;
 IF p_candidate_dates IS NULL OR jsonb_typeof(p_candidate_dates)<>'array' THEN
  RAISE EXCEPTION '候補日時の形式が不正です' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_candidate_dates)>100 OR length(coalesce(p_name,''))>200 OR length(coalesce(p_notes,''))>10000 THEN
  RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(nullif(nickname,''),nullif(name,'')) INTO v_name FROM customers WHERE user_id=v_user ORDER BY id LIMIT 1;
 SELECT * INTO v_settings FROM global_settings WHERE organization_id=p_organization_id LIMIT 1;
 SELECT coalesce(custom_holidays,'[]'::jsonb) INTO v_custom_holidays FROM organization_settings WHERE organization_id=p_organization_id LIMIT 1;
 v_custom_holidays:=coalesce(v_custom_holidays,'[]'::jsonb);
 SELECT private_booking_time_slots,private_booking_time_slots_weekend INTO v_weekday_slots,v_weekend_slots
   FROM organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id LIMIT 1;
 INSERT INTO private_groups(organization_id,scenario_master_id,organizer_id,name,invite_code,status,preferred_store_ids,notes)
 VALUES(p_organization_id,p_scenario_master_id,v_user,nullif(trim(p_name),''),encode(extensions.gen_random_bytes(16),'hex'),'gathering',coalesce(p_preferred_store_ids,'{}'),p_notes)
 RETURNING * INTO v_group;
 INSERT INTO private_group_members(group_id,user_id,guest_name,is_organizer,status,joined_at)
 VALUES(v_group.id,v_user,coalesce(v_name,'主催者'),true,'joined',clock_timestamp()) RETURNING id INTO v_member;
 FOR v_date,v_order IN SELECT value,ordinality FROM jsonb_array_elements(p_candidate_dates) WITH ORDINALITY LOOP
  IF jsonb_typeof(v_date)<>'object' OR coalesce(v_date->>'time_slot','') NOT IN ('午前','午後','夜間')
    OR coalesce(v_date->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(v_date->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
   RAISE EXCEPTION '候補日時の形式が不正です' USING ERRCODE='22023';
  END IF;
  -- 作品の貸切受付枠（平日・土日祝は別々。未設定は全枠受付）。候補追加時の判定と同じ。
  -- 希望店舗があるときは、店舗ごとの平日／土日祝（特別営業日を含む）で下の private_booking_store_slot_rule が判定する（issue #1200）。
  -- ここ（組織の平日／土日祝）で判定するのは希望店舗が空のときだけ（従来どおり）。
  v_cand:=(v_date->>'date')::date;
  v_holiday:=extract(dow FROM v_cand) IN (0,6) OR public.is_booking_calendar_holiday(v_cand) OR coalesce(v_custom_holidays ? v_cand::text,false);
  v_allowed:=CASE WHEN v_holiday THEN v_weekend_slots ELSE v_weekday_slots END;
  IF coalesce(cardinality(p_preferred_store_ids),0)=0 AND coalesce(cardinality(v_allowed),0)>0 AND NOT EXISTS(
   SELECT 1 FROM unnest(v_allowed) value WHERE value=ANY(CASE v_date->>'time_slot'
    WHEN '午前' THEN ARRAY['午前','朝公演','朝'] WHEN '午後' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
  ) THEN RAISE EXCEPTION 'この作品では選択できない時間帯です' USING ERRCODE='22023'; END IF;
  -- 希望店舗のどれか 1 店で「枠が有効（I2・I10。private_booking_store_slot_rule）AND 受付停止・募集停止・公演と重ならない」が
  -- 成り立つ候補だけ作る（issue #1200）。店舗ごとに両方を確かめ、他店の条件を混ぜない。希望店舗が空なら店舗は見ない（従来どおり）
  IF coalesce(cardinality(p_preferred_store_ids),0)>0 THEN
   v_slot:=CASE v_date->>'time_slot' WHEN '午前' THEN 'morning' WHEN '午後' THEN 'afternoon' ELSE 'evening' END;
   v_start:=(v_date->>'start_time')::time; v_end:=(v_date->>'end_time')::time;
   v_rule:=NULL; v_busy:=NULL; v_ok:=false;
   SELECT count(DISTINCT s)=1 INTO v_single FROM unnest(p_preferred_store_ids) s;
   FOR v_store IN SELECT DISTINCT s FROM unnest(p_preferred_store_ids) s ORDER BY s LOOP
    v_r:=public.private_booking_store_slot_rule(p_organization_id,p_scenario_master_id,v_store,v_cand,v_slot,v_single);
    IF v_r IS NOT NULL THEN v_rule:=CASE WHEN v_rule='closed' OR v_r='closed' THEN 'closed' ELSE v_r END; CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM schedule_blocked_slots b WHERE b.organization_id=p_organization_id AND b.store_id=v_store::text AND b.date=v_cand AND b.time_slot=v_slot)
     OR public.is_store_recruitment_paused(v_store,'private',v_cand) THEN v_busy:='blocked'; CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM schedule_events e WHERE e.organization_id=p_organization_id AND e.store_id=v_store AND e.is_cancelled=false
     AND e.date BETWEEN v_cand-2 AND v_cand+2
     AND e.date+e.start_time < v_cand+v_end+CASE WHEN v_end<v_start THEN interval '1 day' ELSE interval '0 days' END+make_interval(mins=>public.resolve_preparation_minutes(p_organization_id,NULL,NULL,e.id))
     AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand+v_start-make_interval(mins=>public.resolve_preparation_minutes(p_organization_id,v_store,p_scenario_master_id,NULL))
    ) THEN v_busy:=coalesce(v_busy,'conflict'); CONTINUE; END IF;
    v_ok:=true; EXIT;
   END LOOP;
   IF NOT v_ok THEN
    RAISE EXCEPTION '選択した候補日時は現在受付できません（%/% %: %）。空き状況を更新して選び直してください',
     extract(month FROM v_cand),extract(day FROM v_cand),CASE v_date->>'time_slot' WHEN '夜間' THEN '夜' ELSE v_date->>'time_slot' END,
     CASE WHEN v_busy='blocked' THEN '受付停止中です' WHEN v_busy='conflict' THEN '他の公演と重なります'
      WHEN v_rule='slot_not_allowed' THEN 'この作品では選択できない時間帯です' ELSE '営業時間外です' END
     USING ERRCODE='22023';
   END IF;
  END IF;
  INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num)
  VALUES(v_group.id,(v_date->>'date')::date,v_date->>'time_slot',v_date->>'start_time',v_date->>'end_time',coalesce((v_date->>'order_num')::integer,v_order::integer));
 END LOOP;
 INSERT INTO private_group_messages(group_id,member_id,message) VALUES(v_group.id,v_member,jsonb_build_object(
  'type','system','action','group_created','organizerName',coalesce(v_name,'主催者'),
  'title',coalesce(nullif(v_settings.system_msg_group_created_title,''),'貸切リクエストグループを作成しました'),
  'body',coalesce(nullif(v_settings.system_msg_group_created_body,''),'招待リンクを共有して、参加メンバーを招待してください。'),
  'note',coalesce(nullif(v_settings.system_msg_group_created_note,''),'※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'))::text);
 RETURN to_jsonb(v_group);
END $$;
REVOKE ALL ON FUNCTION public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text) TO authenticated,service_role;
