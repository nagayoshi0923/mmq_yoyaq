-- Live production definition captured before PR476.
BEGIN;
CREATE OR REPLACE FUNCTION public.is_booking_calendar_holiday(p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM p_date);
  dates DATE[];
  m INTEGER;
  n INTEGER;
  first_day DATE;
BEGIN
  IF p_date IS NULL THEN RETURN FALSE; END IF;
  dates := ARRAY[make_date(y,1,1),make_date(y,2,11),make_date(y,2,23),
    make_date(y,4,29),make_date(y,5,3),make_date(y,5,4),make_date(y,5,5),
    make_date(y,8,11),make_date(y,11,3),make_date(y,11,23),
    make_date(y,3,floor(20.8431+0.242194*(y-1980)-floor((y-1980)/4.0))::int),
    make_date(y,9,floor(23.2488+0.242194*(y-1980)-floor((y-1980)/4.0))::int)];
  FOREACH m IN ARRAY ARRAY[1,7,9,10] LOOP
    n := CASE WHEN m IN (1,10) THEN 2 ELSE 3 END;
    first_day := make_date(y,m,1);
    dates := array_append(dates, first_day + ((8-EXTRACT(DOW FROM first_day)::int)%7) + 7*(n-1));
  END LOOP;
  RETURN p_date = ANY(dates)
    OR (EXTRACT(DOW FROM p_date)=1 AND p_date-1 = ANY(dates))
    OR (p_date-1 = ANY(dates) AND p_date+1 = ANY(dates));
END;
$function$;
COMMIT;
