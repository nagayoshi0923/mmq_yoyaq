-- 契約店舗の既定単価は「店舗が支払う額」(external_license_amount)。
-- franchise / license_amount は作者へ管理店舗が払う額なので使わない。
-- rollback: get_license_partner_report_form を 20260817140000 時点の定義に戻す。

CREATE OR REPLACE FUNCTION public.get_license_partner_report_form(
  p_token TEXT,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.license_partner_stores%ROWTYPE;
  v_items JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;
  IF p_year IS NULL OR p_month IS NULL
     OR p_year < 2020 OR p_year > 2100
     OR p_month < 1 OR p_month > 12 THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_store
    FROM public.license_partner_stores
   WHERE report_token = p_token
     AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'scenario_title'), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT jsonb_build_object(
        'scenario_master_id', c.scenario_master_id,
        'scenario_title', COALESCE(os.override_title, sm.title),
        'author', COALESCE(os.override_author, sm.author, ''),
        'license_amount', COALESCE(
          c.license_amount,
          NULLIF(os.external_license_amount, 0),
          os.license_amount,
          0
        ),
        'performance_count', COALESCE(r.performance_count, 0)
      ) AS item
      FROM public.license_partner_contracts c
      INNER JOIN public.scenario_masters sm
        ON sm.id = c.scenario_master_id
      INNER JOIN public.organization_scenarios os
        ON os.scenario_master_id = c.scenario_master_id
       AND os.organization_id = c.organization_id
       AND os.scenario_type = 'managed'
       AND os.org_status = 'available'
      LEFT JOIN public.license_partner_monthly_reports r
        ON r.partner_store_id = c.partner_store_id
       AND r.scenario_master_id = c.scenario_master_id
       AND r.year = p_year
       AND r.month = p_month
      WHERE c.partner_store_id = v_store.id
        AND c.organization_id = v_store.organization_id
    ) items;

  RETURN jsonb_build_object(
    'partner_store_id', v_store.id,
    'partner_store_name', v_store.name,
    'year', p_year,
    'month', p_month,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_license_partner_report_form(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_license_partner_report_form(TEXT, INTEGER, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_license_partner_report_form(TEXT, INTEGER, INTEGER) IS
  '契約店舗の報告トークンで、その店の契約作品と指定月の回数だけを返す。単価は店別上書き、なければ他店受取金額。無効トークンは NULL。';
