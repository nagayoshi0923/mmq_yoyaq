-- 契約店舗フォームからの月次回数 upsert。契約外シナリオは拒否する。
CREATE OR REPLACE FUNCTION public.submit_license_partner_monthly_report(
  p_token TEXT,
  p_year INTEGER,
  p_month INTEGER,
  p_counts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.license_partner_stores%ROWTYPE;
  v_item JSONB;
  v_scenario_id UUID;
  v_count INTEGER;
  v_updated INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
  v_jst_year INTEGER;
  v_jst_month INTEGER;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '28000';
  END IF;
  IF p_year IS NULL OR p_month IS NULL
     OR p_year < 2020 OR p_year > 2100
     OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = '22023';
  END IF;
  IF p_counts IS NULL OR jsonb_typeof(p_counts) <> 'array' THEN
    RAISE EXCEPTION 'invalid counts' USING ERRCODE = '22023';
  END IF;

  v_jst_year := EXTRACT(YEAR FROM (v_now AT TIME ZONE 'Asia/Tokyo'))::INTEGER;
  v_jst_month := EXTRACT(MONTH FROM (v_now AT TIME ZONE 'Asia/Tokyo'))::INTEGER;
  IF (p_year > v_jst_year) OR (p_year = v_jst_year AND p_month > v_jst_month) THEN
    RAISE EXCEPTION 'future month not allowed' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_store
    FROM public.license_partner_stores
   WHERE report_token = p_token
     AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '28000';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_counts)
  LOOP
    BEGIN
      v_scenario_id := (v_item->>'scenario_master_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid scenario' USING ERRCODE = '22023';
    END;

    BEGIN
      v_count := (v_item->>'performance_count')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid count' USING ERRCODE = '22023';
    END;

    IF v_scenario_id IS NULL OR v_count IS NULL OR v_count < 0 THEN
      RAISE EXCEPTION 'invalid count' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.license_partner_contracts c
      INNER JOIN public.organization_scenarios os
        ON os.scenario_master_id = c.scenario_master_id
       AND os.organization_id = c.organization_id
       AND os.scenario_type = 'managed'
       AND os.org_status = 'available'
      WHERE c.partner_store_id = v_store.id
        AND c.organization_id = v_store.organization_id
        AND c.scenario_master_id = v_scenario_id
    ) THEN
      RAISE EXCEPTION 'scenario not contracted' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.license_partner_monthly_reports (
      organization_id,
      partner_store_id,
      scenario_master_id,
      year,
      month,
      performance_count,
      submitted_at,
      submitted_via
    ) VALUES (
      v_store.organization_id,
      v_store.id,
      v_scenario_id,
      p_year,
      p_month,
      v_count,
      v_now,
      'form'
    )
    ON CONFLICT (partner_store_id, scenario_master_id, year, month)
    DO UPDATE SET
      performance_count = EXCLUDED.performance_count,
      submitted_at = EXCLUDED.submitted_at,
      submitted_via = EXCLUDED.submitted_via;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'updated_count', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_license_partner_monthly_report(TEXT, INTEGER, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_license_partner_monthly_report(TEXT, INTEGER, INTEGER, JSONB) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_license_partner_monthly_report(TEXT, INTEGER, INTEGER, JSONB) IS
  '契約店舗の報告トークンで、契約作品の月次回数だけを upsert する。';
