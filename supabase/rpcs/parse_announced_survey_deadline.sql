-- 旧案内文の月日を公演日の直前の該当日へ復元する（年末年始もJSTで固定）。
CREATE OR REPLACE FUNCTION public.parse_announced_survey_deadline(p_message text,p_performance_date date)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE m text[]; d date;
BEGIN
 IF p_performance_date IS NULL THEN RETURN NULL; END IF;
 m:=regexp_match(p_message,'回答期限[:：][[:space:]]*([0-9]{1,2})月([0-9]{1,2})日');
 IF m IS NULL THEN RETURN NULL; END IF;
 d:=make_date(extract(year FROM p_performance_date)::integer,m[1]::integer,m[2]::integer);
 IF d>p_performance_date THEN d:=make_date(extract(year FROM p_performance_date)::integer-1,m[1]::integer,m[2]::integer); END IF;
 RETURN (d+time '23:59:59.999') AT TIME ZONE 'Asia/Tokyo';
EXCEPTION WHEN datetime_field_overflow THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.parse_announced_survey_deadline(text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.parse_announced_survey_deadline(text,date) TO service_role;
