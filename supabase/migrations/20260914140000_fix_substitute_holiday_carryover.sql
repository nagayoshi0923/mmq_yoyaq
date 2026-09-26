-- Follow-up #475 / PR #470: carry substitute holidays past consecutive holidays.
-- Example: 2026-05-03 (Sun) + 05-04/05 holidays → 2026-05-06 is 振替休日.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_booking_calendar_holiday(p_date DATE)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM p_date);
  dates DATE[];
  m INTEGER;
  n INTEGER;
  first_day DATE;
  d DATE;
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
  IF p_date = ANY(dates) THEN
    RETURN TRUE;
  END IF;
  -- 国民の休日（祝日に挟まれた平日）
  IF p_date-1 = ANY(dates) AND p_date+1 = ANY(dates) THEN
    RETURN TRUE;
  END IF;
  -- 振替休日: 連続する祝日を遡り、日曜の祝日があれば最初の非祝日まで繰り越す
  d := p_date - 1;
  WHILE d = ANY(dates) LOOP
    IF EXTRACT(DOW FROM d) = 0 THEN
      RETURN TRUE;
    END IF;
    d := d - 1;
  END LOOP;
  RETURN FALSE;
END;
$$;

COMMIT;
