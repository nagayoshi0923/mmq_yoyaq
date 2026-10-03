-- 正本（#698）。作品ごとの貸切開始時刻を店舗の営業時間へ上書きする。
CREATE OR REPLACE FUNCTION public.apply_scenario_slot_start_times(p_hours jsonb, p_times jsonb, p_weekend boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
-- 作品ごとの貸切開始時刻（private_booking_slot_start_times）を、店舗の営業時間の各曜日の開始時刻へ上書きする。
-- 画面の applyScenarioSlotStartTimesToRow と同じ解釈（土日祝は weekend、平日は weekday。未設定の枠は店舗設定のまま）。
DECLARE picks jsonb:='{}'::jsonb; bucket jsonb; k text; v text; opening jsonb:='{}'::jsonb; pair record;
BEGIN
 IF p_hours IS NULL OR jsonb_typeof(p_hours->'opening_hours') IS DISTINCT FROM 'object'
  OR p_times IS NULL OR jsonb_typeof(p_times) IS DISTINCT FROM 'object' THEN RETURN p_hours; END IF;
 bucket:=p_times->(CASE WHEN coalesce(p_weekend,false) THEN 'weekend' ELSE 'weekday' END);
 IF jsonb_typeof(bucket) IS DISTINCT FROM 'object' THEN RETURN p_hours; END IF;
 FOREACH k IN ARRAY ARRAY['morning','afternoon','evening'] LOOP
  v:=btrim(coalesce(bucket->>k,''));
  IF left(v,5) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN picks:=picks||jsonb_build_object(k,left(v,5)); END IF;
 END LOOP;
 IF picks='{}'::jsonb THEN RETURN p_hours; END IF;
 FOR pair IN SELECT * FROM jsonb_each(p_hours->'opening_hours') LOOP
  opening:=opening||jsonb_build_object(pair.key,CASE WHEN jsonb_typeof(pair.value)='object'
   THEN pair.value||jsonb_build_object('slot_start_times',
     coalesce(CASE WHEN jsonb_typeof(pair.value->'slot_start_times')='object' THEN pair.value->'slot_start_times' END,'{}'::jsonb)||picks)
   ELSE pair.value END);
 END LOOP;
 RETURN jsonb_set(p_hours,'{opening_hours}',opening);
END $$;
REVOKE ALL ON FUNCTION public.apply_scenario_slot_start_times(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
