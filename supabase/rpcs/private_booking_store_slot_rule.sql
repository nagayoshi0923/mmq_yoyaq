-- 貸切の候補 1 件（日付 × 枠）が、店舗 1 つで、作品の時間枠（I10）と店舗の曜日ごとの枠設定（I2 available_slots）の両方で有効か（issue #1200、main 向け）。
-- 戻り値: NULL = 有効 / 'slot_not_allowed' = 作品の時間枠に無い / 'closed' = この店舗はこの日のこの枠を受け付けていない（上演できない店舗も）。
-- 店舗ごとに判定する（呼び出し側は「この店舗で枠が有効 AND この店舗で空いている」を店舗ごとに確かめ、どれか 1 店で成り立てば通す）。
-- 平日／土日祝の扱いも店舗ごと: 土日・祝日・組織の独自休日に加え、その店舗の特別営業日（special_open_days）は土日祝（I5）。
--   I10 の平日／土日祝の枠、作品の開始時刻（I11）はこの店舗ごとの扱いで読む（private_booking_slot_store_fit と同じ）。
-- 店舗の枠は表示・候補の追加と同じ private_booking_store_day_slots で読む。開店時刻（open_time）では決めない
--   （昼 12:00・夜 16:00 などの固定開始は、枠が有効なら通る）。公演・受付停止・募集停止は呼び出し側で見る。
-- p_single: 希望店舗・送る店舗が 1 店だけか（営業設定の無い店舗を 3 枠とも有効とみなすのはそのときだけ。表示と同じ）。
-- 店舗の絞り込み（同じ組織・有効・オフィス以外・作品の上演店舗／臨時会場以外）は private_booking_slot_store_fit と同じ。
CREATE OR REPLACE FUNCTION public.private_booking_store_slot_rule(p_org uuid, p_scenario_id uuid, p_store_id uuid, p_date date, p_slot text, p_single boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_available_stores text[]; v_weekday text[]; v_weekend text[]; v_start_times jsonb; v_custom jsonb;
 v_holiday boolean; v_hours jsonb; v_weekend_day boolean; v_allowed text[]; v_eff jsonb;
BEGIN
 IF p_store_id IS NULL OR p_date IS NULL OR p_slot IS NULL OR p_slot NOT IN ('morning','afternoon','evening') THEN RETURN 'closed'; END IF;
 SELECT s.available_stores, s.private_booking_time_slots, s.private_booking_time_slots_weekend, s.private_booking_slot_start_times
   INTO v_available_stores, v_weekday, v_weekend, v_start_times
 FROM public.organization_scenarios s
 WHERE s.organization_id=p_org AND (s.scenario_master_id=p_scenario_id OR s.id=p_scenario_id)
 ORDER BY (s.id=p_scenario_id) DESC LIMIT 1;
 SELECT to_jsonb(h) INTO v_hours FROM public.stores s
  LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=p_org
 WHERE s.id=p_store_id AND s.organization_id=p_org AND s.status='active'
  AND s.ownership_type IS DISTINCT FROM 'office'
  AND CASE WHEN coalesce(cardinality(v_available_stores),0)>0 THEN s.id::text=ANY(v_available_stores) ELSE NOT coalesce(s.is_temporary,false) END
 ORDER BY h.id LIMIT 1;
 IF NOT FOUND THEN RETURN 'closed'; END IF;
 SELECT coalesce(os.custom_holidays,'[]'::jsonb) INTO v_custom FROM public.organization_settings os WHERE os.organization_id=p_org;
 v_holiday:=extract(dow FROM p_date) IN (0,6) OR public.is_booking_calendar_holiday(p_date) OR coalesce(v_custom ? p_date::text,false);
 v_weekend_day:=v_holiday OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(v_hours->'special_open_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text);
 -- I10（この店舗での平日／土日祝で読む）
 v_allowed:=CASE WHEN v_weekend_day THEN v_weekend ELSE v_weekday END;
 IF coalesce(cardinality(v_allowed),0)>0 AND NOT EXISTS(
  SELECT 1 FROM unnest(v_allowed) value WHERE value=ANY(CASE p_slot
   WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
 ) THEN RETURN 'slot_not_allowed'; END IF;
 -- I2（private_booking_slot_store_fit と同じ読み方）
 v_eff:=public.apply_scenario_slot_start_times(v_hours,v_start_times,v_weekend_day);
 IF EXISTS(SELECT 1 FROM public.private_booking_store_day_slots(p_date,v_eff,v_holiday,coalesce(p_single,false)) x WHERE x.slot_key=p_slot) THEN
  RETURN NULL;
 END IF;
 RETURN 'closed';
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_store_slot_rule(uuid,uuid,uuid,date,text,boolean) FROM PUBLIC,anon,authenticated;
