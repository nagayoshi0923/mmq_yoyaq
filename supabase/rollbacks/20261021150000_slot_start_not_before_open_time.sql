-- 巻き戻し: 20261021150000_slot_start_not_before_open_time.sql
-- private_booking_store_day_slots を変更前（朝の開始時刻の設定が開店時刻より優先される。20261020100000 適用後の版）に戻す。
-- private_booking_slot_store_fit も変更前（作品の開始時刻が開店前でも、そのまま／開店時刻で判定する）に戻す。
-- 適用後は supabase/rpcs/private_booking_store_day_slots.sql と private_booking_candidate_slot_availability.sql の同名関数も同じ内容に戻すこと。

-- 候補日保存時に用いる営業枠。画面の getPerStoreSlotsForDate と同じ設定解釈。
-- 祝日判定は呼出側が組織の独自休日と日本の祝日を合わせて渡す。
-- 店舗の曜日設定の available_slots に無い枠は返さない（2026-10-20: 札幌店の平日朝。以前は朝・夜を常に足していた）。
-- 営業設定が無い店舗（合成）と available_slots が空の日は 3 枠とも有効。営業中の範囲は「有効な枠のうち最初の枠の開始〜閉店」。
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

-- 店舗ごとの判定（変更前）
CREATE OR REPLACE FUNCTION public.private_booking_slot_store_fit(
 p_org uuid, p_scenario_id uuid, p_scenario jsonb, p_store_ids uuid[], p_date date, p_holiday boolean, p_slot text, p_start_min integer
) RETURNS TABLE(store_id uuid, start_min integer, standard_min integer, fits boolean, why text, gap_minutes integer, fixed boolean, minutes integer)
LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
 -- p_scenario: 作品の行（organization_scenarios_with_master を to_jsonb したもの）。title / available_stores /
 --   private_booking_slot_start_times / duration / weekend_duration / private_booking_time_slots(_weekend) を読む。
 -- p_holiday: 組織として土日祝か（土日・祝日・独自休日）。店舗の特別営業日（special_open_days）は店舗ごとにここで足す。
 --   土日祝の扱いになった店舗は、所要時間・作品の貸切時間枠・作品の開始時刻・作品名の特例をすべて土日祝の値で判定する（I5）。
 -- p_start_min を渡すとその開始時刻で判定する（保存時）。NULL なら店舗ごとに開始時刻を選ぶ（表示時）。
 -- fixed: 作品にこの枠の貸切開始時刻がある（2026-10-15 社長決定: その時刻を絶対とし、ずらさない）。
 --   表示時は標準開始（＝作品の開始時刻）だけを試し、保存時は標準開始以外を why=fixed_start で弾く。
 -- fits: すべての占有を除いて入る。why（入らないとき）: slot_not_allowed=作品の貸切時間枠に無い /
 --   closed=営業時間だけで入らない / conflict=受付停止を無視しても公演と重なって入らない /
 --   blocked=それ以外（受付停止・募集停止のために入らない）。
 -- gap_minutes: すべての占有を除いた隙間のうち、この枠の時間帯にかかる隙間の最大長（理由の補足用）。
 -- minutes: この店舗で使う所要時間（土日祝の扱いなら土日祝の所要時間）。
 -- 1つの店舗で全条件が成立すること。他店の条件を混ぜない。
DECLARE
 st record; eff jsonb; slots jsonb; band record; day_open integer; lb integer; prep integer; special boolean;
 free_hours int4multirange; free_unblocked int4multirange; free_events int4multirange; free_all int4multirange;
 occ int4multirange; cand int4range; hours_ok boolean; unblocked_ok boolean; events_ok boolean;
 weekend boolean; lo integer; hi_excl integer; allowed text[]; slot_times jsonb; title text; available text[];
 weekday_minutes integer; weekend_minutes integer;
BEGIN
 title:=coalesce(p_scenario->>'title','');
 slot_times:=p_scenario->'private_booking_slot_start_times';
 available:=CASE WHEN jsonb_typeof(p_scenario->'available_stores')='array'
  THEN ARRAY(SELECT jsonb_array_elements_text(p_scenario->'available_stores')) ELSE '{}'::text[] END;
 weekday_minutes:=nullif(p_scenario->>'duration','')::integer;
 weekend_minutes:=nullif(p_scenario->>'weekend_duration','')::integer;
 FOR st IN SELECT s.id, to_jsonb(h) AS hours FROM public.stores s
  LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=p_org
  WHERE s.id=ANY(p_store_ids) AND s.organization_id=p_org AND s.status='active'
   AND s.ownership_type IS DISTINCT FROM 'office'
   AND CASE WHEN coalesce(cardinality(available),0)>0 THEN s.id::text=ANY(available) ELSE NOT coalesce(s.is_temporary,false) END
  ORDER BY s.id
 LOOP
  store_id:=st.id; start_min:=NULL; standard_min:=NULL; fits:=false; why:='closed'; gap_minutes:=NULL; fixed:=false;
  hours_ok:=false; unblocked_ok:=false; events_ok:=false;
  -- 店舗の特別営業日は土日祝の扱い（I5: 日曜の営業設定と土日祝の作品設定を使う。#698）
  weekend:=p_holiday OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(st.hours->'special_open_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text);
  minutes:=CASE WHEN weekend AND coalesce(weekend_minutes,0)>0 THEN weekend_minutes ELSE weekday_minutes END;
  -- 作品の貸切時間枠（平日／土日祝で別。空なら制限なし。I10）
  allowed:=CASE WHEN jsonb_typeof(p_scenario->(CASE WHEN weekend THEN 'private_booking_time_slots_weekend' ELSE 'private_booking_time_slots' END))='array'
   THEN ARRAY(SELECT jsonb_array_elements_text(p_scenario->(CASE WHEN weekend THEN 'private_booking_time_slots_weekend' ELSE 'private_booking_time_slots' END))) END;
  IF coalesce(cardinality(allowed),0)>0 AND NOT EXISTS(SELECT 1 FROM unnest(allowed) value WHERE value=ANY(CASE p_slot
    WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)) THEN
   why:='slot_not_allowed'; RETURN NEXT; CONTINUE;
  END IF;
  IF coalesce(minutes,0)<=0 THEN RETURN NEXT; CONTINUE; END IF;
  special:=p_slot='evening' AND weekend AND (title LIKE '%戦塵のレガストリア%' OR title LIKE '%BeatSpecter%');
  -- 作品ごとの開始時刻を店舗の開始時刻へ上書きする
  eff:=public.apply_scenario_slot_start_times(st.hours,slot_times,weekend);
  -- 作品にこの枠の開始時刻があるか（apply_scenario_slot_start_times と同じ読み方）
  fixed:=jsonb_typeof(slot_times)='object'
   AND left(btrim(coalesce(slot_times->(CASE WHEN weekend THEN 'weekend' ELSE 'weekday' END)->>p_slot,'')),5) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO slots FROM public.private_booking_store_day_slots(p_date,eff,weekend,cardinality(p_store_ids)=1) x;
  SELECT (x->>'start_minutes')::integer AS start_minutes,(x->>'end_minutes')::integer AS end_minutes,(x->>'closing_minutes')::integer AS closing_minutes
   INTO band FROM jsonb_array_elements(slots) x WHERE x->>'slot_key'=p_slot;
  IF NOT FOUND THEN RETURN NEXT; CONTINUE; END IF;
  prep:=public.resolve_preparation_minutes(p_org,st.id,p_scenario_id,NULL);
  -- 標準開始。戦塵のレガストリア／BeatSpecter の土日祝の夜は 19:30（それより前には始めない。
  -- ただし 19:30 開始で 23:00 を超えるときは従来どおり 23:00 終わりまで繰り上げてよい）。
  standard_min:=greatest(band.start_minutes,CASE WHEN special THEN 1170 ELSE 0 END);
  -- 開始の下限: 公演が枠の時間帯にかかること（特例はさらに 19:30 または 23:00−所要時間）
  lb:=greatest(band.start_minutes-minutes+1,CASE WHEN special THEN least(standard_min,1380-minutes) ELSE 0 END);
  SELECT min((x->>'start_minutes')::integer) INTO day_open FROM jsonb_array_elements(slots) x;
  free_hours:=CASE WHEN day_open<band.closing_minutes THEN int4multirange(int4range(day_open,band.closing_minutes)) ELSE '{}'::int4multirange END;
  -- 受付停止はその枠の時間帯全体。貸切募集停止期間は全日。
  IF EXISTS(SELECT 1 FROM public.store_recruitment_pauses pz WHERE pz.organization_id=p_org AND pz.store_id=st.id AND pz.pause_type='private'
   AND p_date BETWEEN coalesce(pz.starts_on,p_date) AND coalesce(pz.ends_on,p_date)) THEN
   free_unblocked:='{}'::int4multirange;
  ELSE
   SELECT range_agg(int4range((x->>'start_minutes')::integer,(x->>'end_minutes')::integer)) INTO occ
   FROM public.schedule_blocked_slots b JOIN jsonb_array_elements(slots) x ON x->>'slot_key'=b.time_slot
   WHERE b.organization_id=p_org AND b.store_id=st.id::text AND b.date=p_date;
   free_unblocked:=free_hours-coalesce(occ,'{}'::int4multirange);
  END IF;
  -- 公演は前に公演側の準備時間、後ろにこの作品の準備時間を足す。日をまたぐ公演も当日 0 時からの分で扱う。
  SELECT range_agg(int4range(r.s-public.resolve_preparation_minutes(p_org,NULL,NULL,r.id),r.e+prep)) INTO occ
  FROM (SELECT e.id,(e.date-p_date)*1440+extract(hour FROM e.start_time)::integer*60+extract(minute FROM e.start_time)::integer AS s,
    (e.date-p_date)*1440+CASE WHEN e.end_time<e.start_time THEN 1440 ELSE 0 END+extract(hour FROM e.end_time)::integer*60+extract(minute FROM e.end_time)::integer AS e
   FROM public.schedule_events e WHERE e.organization_id=p_org AND e.store_id=st.id AND e.is_cancelled=false
    AND e.date BETWEEN p_date-2 AND p_date+2) r
  WHERE r.e>=r.s;
  free_events:=free_hours-coalesce(occ,'{}'::int4multirange);
  free_all:=free_unblocked-coalesce(occ,'{}'::int4multirange);
  SELECT max(upper(g)-lower(g)) INTO gap_minutes FROM unnest(free_all) g WHERE lower(g)<band.end_minutes AND upper(g)>band.start_minutes;
  -- 開始時刻を探す範囲。作品の開始時刻があれば標準開始の 1 点だけ（ずらさない）
  lo:=CASE WHEN fixed THEN standard_min ELSE lb END;
  hi_excl:=CASE WHEN fixed THEN standard_min+1 ELSE band.end_minutes END;
  IF p_start_min IS NOT NULL THEN
   IF p_start_min>=lo AND p_start_min<hi_excl THEN
    cand:=int4range(p_start_min,p_start_min+minutes);
    hours_ok:=free_hours@>cand; unblocked_ok:=free_unblocked@>cand; events_ok:=free_events@>cand; fits:=free_all@>cand;
   END IF;
   IF fits THEN start_min:=p_start_min; END IF;
  ELSE
   hours_ok:=public.private_booking_pick_start(free_hours,minutes,lo,hi_excl,standard_min) IS NOT NULL;
   unblocked_ok:=public.private_booking_pick_start(free_unblocked,minutes,lo,hi_excl,standard_min) IS NOT NULL;
   events_ok:=public.private_booking_pick_start(free_events,minutes,lo,hi_excl,standard_min) IS NOT NULL;
   start_min:=public.private_booking_pick_start(free_all,minutes,lo,hi_excl,standard_min);
   fits:=start_min IS NOT NULL;
  END IF;
  why:=CASE WHEN fits THEN NULL WHEN fixed AND p_start_min IS NOT NULL AND p_start_min<>standard_min THEN 'fixed_start'
   WHEN NOT hours_ok THEN 'closed' WHEN unblocked_ok AND NOT events_ok THEN 'conflict' ELSE 'blocked' END;
  RETURN NEXT;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_slot_store_fit(uuid,uuid,jsonb,uuid[],date,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_booking_slot_store_fit(uuid,uuid,jsonb,uuid[],date,boolean,text,integer) TO service_role;
