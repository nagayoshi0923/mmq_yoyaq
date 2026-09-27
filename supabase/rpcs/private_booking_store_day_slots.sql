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
