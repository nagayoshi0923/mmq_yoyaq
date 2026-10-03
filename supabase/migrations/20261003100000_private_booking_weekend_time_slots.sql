-- #345 / #473: 貸切時間枠の「土日・祝日」設定を保存できるようにし、土日祝はその設定で判定する。
-- これまで画面に土日祝の欄はあったが DB に列が無く保存されず、土日祝も平日の設定で判定されていた
-- （例: 「夜公演限定」にしても保持されない）。
-- 今の見え方を変えないよう、既存の作品は平日の設定を土日祝にも写す（本番で平日を絞っている作品は 1 件、3 枠すべて許可）。
-- 以後は土日祝の設定を独立して使う。空なら全枠受付（平日の空と同じ）。
ALTER TABLE public.organization_scenarios ADD COLUMN IF NOT EXISTS private_booking_time_slots_weekend text[];
UPDATE public.organization_scenarios
   SET private_booking_time_slots_weekend = private_booking_time_slots
 WHERE private_booking_time_slots_weekend IS NULL AND coalesce(cardinality(private_booking_time_slots), 0) > 0;

CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
 SELECT os.scenario_master_id AS id,
    os.id AS org_scenario_id,
    os.organization_id,
    os.scenario_master_id,
    os.slug,
    os.org_status AS status,
    os.org_status,
    COALESCE(os.override_title, sm.title) AS title,
    COALESCE(os.override_author, sm.author) AS author,
    COALESCE(os.report_display_name, sm.report_display_name, COALESCE(os.override_author, sm.author)) AS report_display_name,
    sm.author_email,
    sm.author_id,
    COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
    COALESCE(os.custom_description, sm.description) AS description,
    COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
    COALESCE(os.custom_caution, sm.caution) AS caution,
    COALESCE(os.override_player_count_min, sm.player_count_min) AS player_count_min,
    COALESCE(os.override_player_count_max, sm.player_count_max) AS player_count_max,
    os.male_count,
    os.female_count,
    os.other_count,
    COALESCE(os.duration, sm.official_duration) AS duration,
    os.weekend_duration,
    COALESCE(os.override_genre, sm.genre) AS genre,
    COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
    COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
    sm.release_date,
    sm.official_site_url,
    sm.required_items AS required_props,
    os.participation_fee,
    os.gm_test_participation_fee,
    os.participation_costs,
    os.flexible_pricing,
    os.use_flexible_pricing,
    os.license_amount,
    os.gm_test_license_amount,
    os.franchise_license_amount,
    os.franchise_gm_test_license_amount,
    os.external_license_amount,
    os.external_gm_test_license_amount,
    os.fc_receive_license_amount,
    os.fc_receive_gm_test_license_amount,
    os.fc_author_license_amount,
    os.fc_author_gm_test_license_amount,
    os.gm_costs,
    os.gm_count,
    os.gm_assignments,
    COALESCE(( SELECT array_agg(st.name ORDER BY st.name) AS array_agg
           FROM (staff_scenario_assignments ssa
             JOIN staff st ON ((st.id = ssa.staff_id)))
          WHERE ((ssa.scenario_master_id = os.scenario_master_id) AND (ssa.organization_id = os.organization_id) AND ((ssa.can_main_gm = true) OR (ssa.can_sub_gm = true)))), ARRAY[]::text[]) AS available_gms,
    COALESCE(( SELECT array_agg(st.name ORDER BY st.name) AS array_agg
           FROM (staff_scenario_assignments ssa
             JOIN staff st ON ((st.id = ssa.staff_id)))
          WHERE ((ssa.scenario_master_id = os.scenario_master_id) AND (ssa.organization_id = os.organization_id) AND (ssa.is_experienced = true) AND (COALESCE(ssa.can_main_gm, false) = false) AND (COALESCE(ssa.can_sub_gm, false) = false))), ARRAY[]::text[]) AS experienced_staff,
    os.available_stores,
    os.production_cost,
    os.production_costs,
    os.depreciation_per_performance,
    os.extra_preparation_time,
    ( SELECT (count(*))::integer AS count
           FROM schedule_events se
          WHERE ((se.scenario_master_id = os.scenario_master_id) AND (se.organization_id = os.organization_id) AND (se.date <= CURRENT_DATE) AND (se.is_cancelled IS NOT TRUE) AND (se.category <> 'offsite'::text))) AS play_count,
    os.notes,
    os.created_at,
    os.updated_at,
    sm.master_status,
    os.pricing_patterns,
    sm.is_shared,
    COALESCE(os.scenario_type, 'normal'::text) AS scenario_type,
    (0)::numeric AS rating,
    COALESCE(os.kit_count, 1) AS kit_count,
    '[]'::jsonb AS license_rewards,
    COALESCE(os.is_recommended, false) AS is_recommended,
    os.survey_url,
    COALESCE(os.survey_enabled, false) AS survey_enabled,
    COALESCE(os.survey_deadline_days, 1) AS survey_deadline_days,
    COALESCE(os.characters, '[]'::jsonb) AS characters,
    os.pre_reading_notice_message,
    os.booking_start_date,
    os.booking_end_date,
    os.individual_notice_template,
    COALESCE(os.character_assignment_method, 'survey'::text) AS character_assignment_method,
    COALESCE(os.private_booking_time_slots, ARRAY[]::text[]) AS private_booking_time_slots,
    COALESCE(os.private_booking_blocked_slots, ARRAY[]::text[]) AS private_booking_blocked_slots,
    COALESCE(os.scenario_kind, 'regular'::text) AS scenario_kind,
    COALESCE(os.accepts_private_booking, true) AS accepts_private_booking,
    os.available_from,
    os.available_until,
    COALESCE(os.custom_sensitive_tags, sm.sensitive_tags, ARRAY[]::text[]) AS sensitive_tags,
    COALESCE(os.is_license_buyout, false) AS is_license_buyout,
    os.private_booking_slot_start_times,
    os.private_booking_time_slots_weekend
   FROM (organization_scenarios os
     JOIN scenario_masters sm ON ((sm.id = os.scenario_master_id)));

CREATE OR REPLACE VIEW public.organization_scenarios_public AS
 SELECT os.scenario_master_id AS id,
    os.id AS org_scenario_id,
    os.organization_id,
    os.scenario_master_id,
    os.slug,
    os.org_status AS status,
    COALESCE(os.override_title, sm.title) AS title,
    COALESCE(os.override_author, sm.author) AS author,
    sm.author_id,
    COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
    COALESCE(os.custom_description, sm.description) AS description,
    COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
    COALESCE(os.custom_caution, sm.caution) AS caution,
    COALESCE(os.override_player_count_min, sm.player_count_min) AS player_count_min,
    COALESCE(os.override_player_count_max, sm.player_count_max) AS player_count_max,
    os.male_count,
    os.female_count,
    os.other_count,
    COALESCE(os.duration, sm.official_duration) AS duration,
    os.weekend_duration,
    COALESCE(os.override_genre, sm.genre) AS genre,
    COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
    COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
    sm.release_date,
    sm.official_site_url,
    sm.required_items AS required_props,
    os.participation_fee,
    os.gm_test_participation_fee,
    os.participation_costs,
    os.flexible_pricing,
    os.use_flexible_pricing,
    os.pricing_patterns,
    os.available_stores,
    os.extra_preparation_time,
    sm.master_status,
    true AS is_shared,
    COALESCE(os.scenario_type, 'normal'::text) AS scenario_type,
    (0)::numeric AS rating,
    COALESCE(os.kit_count, 1) AS kit_count,
    COALESCE(os.is_recommended, false) AS is_recommended,
    os.survey_url,
    COALESCE(os.survey_enabled, false) AS survey_enabled,
    COALESCE(os.survey_deadline_days, 1) AS survey_deadline_days,
    COALESCE(os.characters, '[]'::jsonb) AS characters,
    os.pre_reading_notice_message,
    os.booking_start_date,
    os.booking_end_date,
    os.individual_notice_template,
    COALESCE(os.character_assignment_method, 'survey'::text) AS character_assignment_method,
    COALESCE(os.private_booking_time_slots, ARRAY[]::text[]) AS private_booking_time_slots,
    COALESCE(os.private_booking_blocked_slots, ARRAY[]::text[]) AS private_booking_blocked_slots,
    os.created_at,
    os.updated_at,
    COALESCE(os.private_booking_time_slots_weekend, ARRAY[]::text[]) AS private_booking_time_slots_weekend
   FROM (organization_scenarios os
     JOIN scenario_masters sm ON ((sm.id = os.scenario_master_id)));

-- グループの候補日追加: 土日祝（日曜・土曜・祝日・組織の独自休日）は土日祝の時間枠で判定する
CREATE OR REPLACE FUNCTION public.private_group_add_candidate_dates(p_group_id uuid, p_request_id uuid, p_expected_scenario_id uuid, p_expected_store_ids uuid[], p_candidates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 g public.private_groups%ROWTYPE; sc record; receipt public.private_group_candidate_add_requests%ROWTYPE;
 current_stores uuid[]; expected_stores uuid[]; payload jsonb; item jsonb; ids uuid[]:='{}'; candidate_id uuid;
 candidate_date date; v_start_at timestamp; v_end_at timestamp; slot text; slot_label text;
 minutes integer; start_min integer; end_min integer; next_order integer; res_status text;
 holiday boolean; custom_holidays jsonb; valid_store boolean; author_member uuid; notice_dates jsonb:='[]';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501'; END IF;
 -- 他の予約処理が予約→グループ順にロックする場合は待ち合わせず再読込を促す。
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.private_group_actor_role(p_group_id) IS NULL THEN
  RAISE EXCEPTION '候補日を追加する権限がありません' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_expected_scenario_id IS NULL OR p_expected_store_ids IS NULL
  OR array_position(p_expected_store_ids,NULL) IS NOT NULL
  OR jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION '候補日の入力を確認してください' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '候補日は1〜100件選択してください' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO expected_stores FROM unnest(p_expected_store_ids) id;
 payload:=jsonb_build_object('scenario_id',p_expected_scenario_id,'store_ids',expected_stores,'candidates',p_candidates);
 SELECT * INTO receipt FROM public.private_group_candidate_add_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.group_id IS DISTINCT FROM g.id OR receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION '同じ送信番号で異なる候補日を保存できません' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('success',true,'candidate_ids',receipt.candidate_ids,'replayed',true);
 END IF;
 IF g.status NOT IN ('gathering','date_adjusting') OR g.status IS NULL THEN
  RAISE EXCEPTION '店舗の返答待ち、確定後、取消後は候補日を追加できません' USING ERRCODE='22023';
 END IF;
 IF g.reservation_id IS NOT NULL THEN
  SELECT status INTO res_status FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR SHARE NOWAIT;
  IF res_status IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION '予約申請中は候補日を追加できません' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO current_stores FROM unnest(g.preferred_store_ids) id;
 IF coalesce(g.scenario_master_id,g.scenario_id) IS DISTINCT FROM p_expected_scenario_id OR current_stores IS DISTINCT FROM expected_stores THEN
  RAISE EXCEPTION '作品または希望店舗が変更されています。画面を更新して選び直してください' USING ERRCODE='40001';
 END IF;
 IF cardinality(current_stores)=0 THEN RAISE EXCEPTION '希望店舗を選択してください' USING ERRCODE='22023'; END IF;
 SELECT s.* INTO sc FROM public.organization_scenarios_with_master s WHERE s.organization_id=g.organization_id
  AND (s.scenario_master_id=p_expected_scenario_id OR s.id=p_expected_scenario_id)
  ORDER BY (s.id=p_expected_scenario_id) DESC LIMIT 1;
 IF NOT FOUND OR coalesce(sc.duration,0)<=0 THEN RAISE EXCEPTION '作品の所要時間を確認できません' USING ERRCODE='22023'; END IF;
 SELECT coalesce(os.custom_holidays,'[]'::jsonb) INTO custom_holidays FROM public.organization_settings os WHERE os.organization_id=g.organization_id;
 SELECT coalesce(max(order_num),0)+1 INTO next_order FROM public.private_group_candidate_dates WHERE group_id=g.id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
   OR coalesce(item->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR coalesce(item->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR coalesce(item->>'time_slot','') NOT IN ('morning','afternoon','evening') THEN
   RAISE EXCEPTION '候補日時の形式が正しくありません' USING ERRCODE='22023';
  END IF;
  candidate_date:=(item->>'date')::date; slot:=item->>'time_slot';
  slot_label:=CASE slot WHEN 'morning' THEN '午前' WHEN 'afternoon' THEN '午後' ELSE '夜' END;
  PERFORM public.assert_private_booking_candidate_date(g.organization_id,p_expected_scenario_id,candidate_date);
  holiday:=extract(dow FROM candidate_date) IN (0,6) OR public.is_booking_calendar_holiday(candidate_date) OR coalesce(custom_holidays ? candidate_date::text,false);
  minutes:=CASE WHEN holiday AND coalesce(sc.weekend_duration,0)>0 THEN sc.weekend_duration ELSE sc.duration END;
  v_start_at:=candidate_date+(item->>'start_time')::time; v_end_at:=v_start_at+make_interval(mins=>minutes);
  IF v_end_at::date<>candidate_date OR v_end_at::time>'23:00'::time OR v_end_at::time<>(item->>'end_time')::time THEN
   RAISE EXCEPTION '公演時間が更新されているか、営業時間内に収まりません。候補日を選び直してください' USING ERRCODE='40001';
  END IF;
  IF coalesce(cardinality(CASE WHEN holiday THEN sc.private_booking_time_slots_weekend ELSE sc.private_booking_time_slots END),0)>0 AND NOT EXISTS(
   SELECT 1 FROM unnest(CASE WHEN holiday THEN sc.private_booking_time_slots_weekend ELSE sc.private_booking_time_slots END) value WHERE value=ANY(CASE slot
    WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
  ) THEN RAISE EXCEPTION 'この作品では選択できない時間帯です' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_group_candidate_dates cd WHERE cd.group_id=g.id AND cd.date=candidate_date
   AND cd.status IS DISTINCT FROM 'rejected' AND cd.time_slot=ANY(CASE slot WHEN 'morning' THEN ARRAY['morning','午前','朝'] WHEN 'afternoon' THEN ARRAY['afternoon','午後','昼'] ELSE ARRAY['evening','夜','夜間'] END)) THEN
   RAISE EXCEPTION '同じ日付・時間帯の候補は既に追加されています' USING ERRCODE='23505';
  END IF;
  start_min:=extract(hour FROM v_start_at)::integer*60+extract(minute FROM v_start_at)::integer;
  end_min:=start_min+minutes;
  -- 1つの店舗で営業枠と準備時間を含む空きの両方が成立すること。他店の条件を混ぜない。
  SELECT EXISTS(
   SELECT 1 FROM public.stores s
   LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=g.organization_id
   CROSS JOIN LATERAL public.private_booking_store_day_slots(candidate_date,to_jsonb(h),holiday,cardinality(current_stores)=1) band
   CROSS JOIN LATERAL (
    SELECT coalesce(max(start_minutes) FILTER (WHERE slot_key='evening'),1140)
      - public.resolve_preparation_minutes(g.organization_id,s.id,p_expected_scenario_id,NULL) AS evening_deadline,
     coalesce(max(start_minutes) FILTER (WHERE slot_key='afternoon'),780) AS afternoon_start
    FROM public.private_booking_store_day_slots(candidate_date,to_jsonb(h),holiday,cardinality(current_stores)=1)
   ) weekday
   WHERE s.id=ANY(current_stores) AND s.organization_id=g.organization_id AND s.status='active'
    AND s.ownership_type IS DISTINCT FROM 'office'
    AND CASE WHEN coalesce(cardinality(sc.available_stores),0)>0 THEN s.id::text=ANY(sc.available_stores) ELSE NOT coalesce(s.is_temporary,false) END
    AND band.slot_key=slot
    AND (holiday OR slot='evening'
     OR (slot='morning' AND weekday.evening_deadline-minutes<weekday.afternoon_start)
     OR (slot='afternoon' AND weekday.evening_deadline-minutes>=weekday.afternoon_start AND end_min<=weekday.evening_deadline))
    AND start_min>=CASE WHEN slot='evening' AND greatest(band.start_minutes,CASE WHEN holiday AND (sc.title LIKE '%戦塵のレガストリア%' OR sc.title LIKE '%BeatSpecter%') THEN 1170 ELSE 0 END)+minutes>1380 THEN 1380-minutes
     ELSE greatest(band.start_minutes,CASE WHEN slot='evening' AND holiday AND (sc.title LIKE '%戦塵のレガストリア%' OR sc.title LIKE '%BeatSpecter%') THEN 1170 ELSE 0 END) END
    AND start_min<band.end_minutes
    AND end_min<=band.closing_minutes
    AND NOT EXISTS(SELECT 1 FROM public.schedule_blocked_slots b WHERE b.organization_id=g.organization_id AND b.store_id=s.id::text AND b.date=candidate_date AND b.time_slot=slot)
    AND NOT EXISTS(SELECT 1 FROM public.schedule_events e WHERE e.organization_id=g.organization_id AND e.store_id=s.id AND e.is_cancelled=false
     AND e.date BETWEEN candidate_date-2 AND candidate_date+2
     AND e.date+e.start_time<v_end_at+make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,NULL,NULL,e.id))
     AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END>v_start_at-make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,s.id,p_expected_scenario_id,NULL)))
  ) INTO valid_store;
  IF NOT valid_store THEN RAISE EXCEPTION '選択した候補日時は現在受付できません。空き状況を更新して選び直してください' USING ERRCODE='22023'; END IF;
  INSERT INTO public.private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num)
   VALUES(g.id,candidate_date,CASE WHEN slot='evening' THEN '夜間' ELSE slot_label END,item->>'start_time',item->>'end_time',next_order) RETURNING id INTO candidate_id;
  ids:=array_append(ids,candidate_id); next_order:=next_order+1;
  notice_dates:=notice_dates||jsonb_build_array(jsonb_build_object('date',candidate_date,'time_slot',slot_label));
 END LOOP;
 SELECT id INTO author_member FROM public.private_group_members WHERE group_id=g.id AND user_id=auth.uid() AND status='joined' ORDER BY id LIMIT 1;
 INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(g.id,author_member,
  jsonb_build_object('type','system','action','candidate_dates_added','count',cardinality(ids),'dates',notice_dates)::text);
 INSERT INTO public.private_group_candidate_add_requests(request_id,group_id,actor_id,payload,candidate_ids)
  VALUES(p_request_id,g.id,auth.uid(),payload,ids);
 RETURN jsonb_build_object('success',true,'candidate_ids',ids,'replayed',false);
END $function$;
