-- QW-20260917-001: 候補追加と通知の一括保存。既存RLS・過去候補は変更しない。
BEGIN;
-- 候補追加の通信再試行を識別する内部記録。候補・通知と同じトランザクションで作成する。
CREATE TABLE IF NOT EXISTS public.private_group_candidate_add_requests (
 request_id uuid PRIMARY KEY,
 group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 payload jsonb NOT NULL,
 candidate_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_group_candidate_add_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_candidate_add_requests FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS private_group_candidate_add_requests_group_idx ON public.private_group_candidate_add_requests(group_id);

-- 候補日保存時に用いる営業枠。画面の getPerStoreSlotsForDate と同じ設定解釈。
-- 祝日判定は呼出側が組織の独自休日と日本の祝日を合わせて渡す。
CREATE OR REPLACE FUNCTION public.private_booking_store_day_slots(
 p_date date, p_hours jsonb, p_is_holiday boolean, p_allow_missing boolean
) RETURNS TABLE(slot_key text,start_minutes integer,end_minutes integer,closing_minutes integer)
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE
 names text[]:=ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 dow integer:=extract(dow FROM p_date); weekend boolean;
 opening jsonb; raw_day jsonb; day_key text; pair record;
 synthetic boolean:=false; explicit_morning boolean;
 base_weekend boolean; starts jsonb; slots jsonb; opening_time text; closing_time text;
 start_value text; close_minutes integer; key text;
BEGIN
 IF p_date IS NULL THEN RETURN; END IF;
 IF coalesce(nullif(p_hours->'holidays','null'::jsonb),'[]'::jsonb) ? p_date::text
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(p_hours->'special_closed_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text)
 THEN RETURN; END IF;
 weekend:=dow IN (0,6) OR coalesce(p_is_holiday,false);
 opening:='{}'::jsonb;
 IF jsonb_typeof(p_hours->'opening_hours')='object' THEN
  FOR pair IN SELECT * FROM jsonb_each(p_hours->'opening_hours') LOOP
   IF jsonb_typeof(pair.value)='object' THEN opening:=opening||jsonb_build_object(lower(pair.key),pair.value); END IF;
  END LOOP;
 END IF;
 IF opening='{}'::jsonb THEN
  IF NOT coalesce(p_allow_missing,false) THEN RETURN; END IF;
  synthetic:=true; raw_day:='{}'::jsonb; base_weekend:=weekend; explicit_morning:=true;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(p_hours->'special_open_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text) THEN
   day_key:='sunday'; raw_day:=opening->day_key;
   IF NOT coalesce((raw_day->>'is_open')::boolean,false) THEN
    raw_day:='{}'::jsonb;
   END IF;
  ELSE
   day_key:=CASE WHEN weekend AND dow NOT IN (0,6) THEN 'sunday' ELSE names[dow+1] END;
   raw_day:=opening->day_key;
   IF weekend AND day_key='sunday' AND NOT coalesce((raw_day->>'is_open')::boolean,false)
    AND coalesce((opening->names[dow+1]->>'is_open')::boolean,false) THEN
    day_key:=names[dow+1]; raw_day:=opening->day_key;
   END IF;
   IF NOT coalesce((raw_day->>'is_open')::boolean,false) THEN RETURN; END IF;
  END IF;
  base_weekend:=day_key IN ('sunday','saturday');
  explicit_morning:=coalesce(position(':' IN raw_day->'slot_start_times'->>'morning')>0,false);
 END IF;
 starts:=CASE WHEN base_weekend THEN '{"morning":"10:00","afternoon":"14:00","evening":"19:00"}'::jsonb
  ELSE '{"morning":"10:00","afternoon":"13:00","evening":"19:00"}'::jsonb END;
 IF jsonb_typeof(raw_day->'slot_start_times')='object' THEN starts:=starts||(raw_day->'slot_start_times'); END IF;
 slots:=raw_day->'available_slots';
 IF slots IS NULL OR slots='null'::jsonb OR slots='[]'::jsonb THEN slots:='["morning","afternoon","evening"]'::jsonb; END IF;
 -- 既存画面は朝・夜を常に候補帯へ補う。休業日は上で除外済み。
 slots:=slots||'["morning","evening"]'::jsonb;
 opening_time:=CASE WHEN raw_day ? 'open_time' THEN raw_day->>'open_time' ELSE CASE WHEN base_weekend THEN '09:00' ELSE '10:00' END END;
 closing_time:=CASE WHEN raw_day ? 'close_time' THEN raw_day->>'close_time' ELSE '23:00' END;
 close_minutes:=CASE WHEN position(':' IN closing_time)>0 THEN least(1380,extract(hour FROM closing_time::time)::integer*60+extract(minute FROM closing_time::time)::integer) ELSE 1380 END;
 FOREACH key IN ARRAY ARRAY['morning','afternoon','evening'] LOOP
  IF NOT slots ? key THEN CONTINUE; END IF;
  start_value:=starts->>key;
  IF coalesce(position(':' IN start_value),0)=0 THEN
   start_value:=CASE key WHEN 'morning' THEN '10:00' WHEN 'afternoon' THEN CASE WHEN weekend THEN '14:00' ELSE '13:00' END ELSE '19:00' END;
  END IF;
  start_minutes:=extract(hour FROM start_value::time)::integer*60+extract(minute FROM start_value::time)::integer;
  IF key='morning' AND NOT synthetic AND NOT explicit_morning AND position(':' IN opening_time)>0
   AND opening_time::time<'13:00'::time THEN
   start_minutes:=extract(hour FROM opening_time::time)::integer*60+extract(minute FROM opening_time::time)::integer;
  END IF;
  end_minutes:=CASE key WHEN 'morning' THEN 780 WHEN 'afternoon' THEN 1140 ELSE close_minutes END;
  IF start_minutes<end_minutes THEN slot_key:=key; closing_minutes:=close_minutes; RETURN NEXT; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.private_booking_store_day_slots(date,jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated;

-- QW-20260917-001: 候補日時・通知・通信再試行記録を一括保存。
CREATE OR REPLACE FUNCTION public.private_group_add_candidate_dates(
 p_group_id uuid,p_request_id uuid,p_expected_scenario_id uuid,p_expected_store_ids uuid[],p_candidates jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 g public.private_groups%ROWTYPE; sc record; receipt public.private_group_candidate_add_requests%ROWTYPE;
 current_stores uuid[]; expected_stores uuid[]; payload jsonb; item jsonb; ids uuid[]:='{}'; candidate_id uuid;
 candidate_date date; start_at timestamp; end_at timestamp; slot text; slot_label text;
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
  start_at:=candidate_date+(item->>'start_time')::time; end_at:=start_at+make_interval(mins=>minutes);
  IF end_at::date<>candidate_date OR end_at::time>'23:00'::time OR end_at::time<>(item->>'end_time')::time THEN
   RAISE EXCEPTION '公演時間が更新されているか、営業時間内に収まりません。候補日を選び直してください' USING ERRCODE='40001';
  END IF;
  IF coalesce(cardinality(sc.private_booking_time_slots),0)>0 AND NOT EXISTS(
   SELECT 1 FROM unnest(sc.private_booking_time_slots) value WHERE value=ANY(CASE slot
    WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
  ) THEN RAISE EXCEPTION 'この作品では選択できない時間帯です' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_group_candidate_dates cd WHERE cd.group_id=g.id AND cd.date=candidate_date
   AND cd.status IS DISTINCT FROM 'rejected' AND cd.time_slot=ANY(CASE slot WHEN 'morning' THEN ARRAY['morning','午前','朝'] WHEN 'afternoon' THEN ARRAY['afternoon','午後','昼'] ELSE ARRAY['evening','夜','夜間'] END)) THEN
   RAISE EXCEPTION '同じ日付・時間帯の候補は既に追加されています' USING ERRCODE='23505';
  END IF;
  start_min:=extract(hour FROM start_at)::integer*60+extract(minute FROM start_at)::integer;
  end_min:=start_min+minutes;
  -- 1つの店舗で営業枠と準備時間を含む空きの両方が成立すること。他店の条件を混ぜない。
  SELECT EXISTS(
   SELECT 1 FROM public.stores s
   LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=g.organization_id
   CROSS JOIN LATERAL public.private_booking_store_day_slots(candidate_date,to_jsonb(h),holiday,cardinality(current_stores)=1) band
   WHERE s.id=ANY(current_stores) AND s.organization_id=g.organization_id AND s.status='active'
    AND s.ownership_type IS DISTINCT FROM 'office'
    AND CASE WHEN coalesce(cardinality(sc.available_stores),0)>0 THEN s.id::text=ANY(sc.available_stores) ELSE NOT coalesce(s.is_temporary,false) END
    AND band.slot_key=slot
    AND start_min>=CASE WHEN slot='evening' AND greatest(band.start_minutes,CASE WHEN holiday AND (sc.title LIKE '%戦塵のレガストリア%' OR sc.title LIKE '%BeatSpecter%') THEN 1170 ELSE 0 END)+minutes>1380 THEN 1380-minutes
     ELSE greatest(band.start_minutes,CASE WHEN slot='evening' AND holiday AND (sc.title LIKE '%戦塵のレガストリア%' OR sc.title LIKE '%BeatSpecter%') THEN 1170 ELSE 0 END) END
    AND start_min<band.end_minutes
    AND end_min<=band.closing_minutes
    AND NOT EXISTS(SELECT 1 FROM public.schedule_blocked_slots b WHERE b.organization_id=g.organization_id AND b.store_id=s.id::text AND b.date=candidate_date AND b.time_slot=slot)
    AND NOT EXISTS(SELECT 1 FROM public.schedule_events e WHERE e.organization_id=g.organization_id AND e.store_id=s.id AND e.is_cancelled=false
     AND e.date BETWEEN candidate_date-2 AND candidate_date+2
     AND e.date+e.start_time<end_at+make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,NULL,NULL,e.id))
     AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END>start_at-make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,s.id,p_expected_scenario_id,NULL)))
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
END $$;
REVOKE ALL ON FUNCTION public.private_group_add_candidate_dates(uuid,uuid,uuid,uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_add_candidate_dates(uuid,uuid,uuid,uuid[],jsonb) TO authenticated,service_role;

COMMIT;
