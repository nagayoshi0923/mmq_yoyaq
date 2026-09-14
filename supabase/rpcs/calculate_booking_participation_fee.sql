-- QW-20260914-003 / #469: keep booking-day classification on the server.
-- Same fixed / Happy Monday / equinox rules as japaneseHolidays.ts.
CREATE OR REPLACE FUNCTION public.is_booking_calendar_holiday(p_date DATE)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.calculate_booking_participation_fee(
  p_base_fee INTEGER, p_costs JSONB, p_date DATE, p_start_time TIME,
  p_custom_holiday BOOLEAN DEFAULT FALSE,
  p_pricing_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE
) RETURNS INTEGER LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  slots TEXT[] := ARRAY[]::TEXT[];
  cost JSONB;
  holiday BOOLEAN := public.is_booking_calendar_holiday(p_date) OR COALESCE(p_custom_holiday,FALSE);
  fee INTEGER;
  pricing_date TEXT := p_pricing_date::TEXT;
BEGIN
  IF EXTRACT(DOW FROM p_date) IN (0,6) OR holiday THEN
    slots := array_append(slots,'weekend');
  END IF;
  IF holiday THEN slots := array_append(slots,'holiday'); END IF;
  IF p_start_time IS NOT NULL THEN
    slots := array_append(slots,CASE WHEN EXTRACT(HOUR FROM p_start_time)<12 THEN 'morning'
      WHEN EXTRACT(HOUR FROM p_start_time)<18 THEN 'afternoon' ELSE 'evening' END);
  END IF;
  slots := slots || ARRAY['normal','通常'];
  IF jsonb_typeof(p_costs)='array' THEN
    SELECT entry INTO cost
    FROM jsonb_array_elements(p_costs) WITH ORDINALITY AS c(entry,ordinal)
    WHERE COALESCE(entry->>'status','active') IN ('active','ready')
      AND (NULLIF(entry->>'startDate','') IS NULL OR entry->>'startDate' <= pricing_date)
      AND (NULLIF(entry->>'endDate','') IS NULL OR entry->>'endDate' >= pricing_date)
      AND entry->>'time_slot'=ANY(slots)
    ORDER BY array_position(slots,entry->>'time_slot'),ordinal LIMIT 1;
  END IF;
  IF cost IS NULL THEN fee := p_base_fee;
  ELSIF cost->>'type'='percentage' THEN
    fee := ROUND(p_base_fee*(1+COALESCE((cost->>'amount')::NUMERIC,0)/100))::INTEGER;
  ELSE fee := (cost->>'amount')::INTEGER;
  END IF;
  IF fee IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE='P0017';
  END IF;
  RETURN fee;
END;
$$;
