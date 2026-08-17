-- 契約先店舗・契約・月次報告。既存の自店舗契約マスタは触らない。
-- anon はテーブル直アクセス不可。公開はトークンRPCのみ。
-- rollback:
--   DROP FUNCTION IF EXISTS public.submit_license_partner_monthly_report(TEXT, INTEGER, INTEGER, JSONB);
--   DROP FUNCTION IF EXISTS public.get_license_partner_report_form(TEXT, INTEGER, INTEGER);
--   DROP TABLE IF EXISTS public.license_partner_monthly_reports;
--   DROP TABLE IF EXISTS public.license_partner_contracts;
--   DROP TABLE IF EXISTS public.license_partner_stores;

CREATE TABLE IF NOT EXISTS public.license_partner_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  discord_channel_id TEXT,
  report_token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT license_partner_stores_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT license_partner_stores_token_not_blank CHECK (length(report_token) >= 32)
);

CREATE INDEX IF NOT EXISTS idx_license_partner_stores_org
  ON public.license_partner_stores (organization_id);

CREATE INDEX IF NOT EXISTS idx_license_partner_stores_discord
  ON public.license_partner_stores (discord_channel_id)
  WHERE discord_channel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.license_partner_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_store_id UUID NOT NULL REFERENCES public.license_partner_stores(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE RESTRICT,
  license_amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT license_partner_contracts_amount_check
    CHECK (license_amount IS NULL OR license_amount >= 0),
  UNIQUE (partner_store_id, scenario_master_id)
);

CREATE INDEX IF NOT EXISTS idx_license_partner_contracts_org
  ON public.license_partner_contracts (organization_id);

CREATE INDEX IF NOT EXISTS idx_license_partner_contracts_store
  ON public.license_partner_contracts (partner_store_id);

CREATE INDEX IF NOT EXISTS idx_license_partner_contracts_scenario
  ON public.license_partner_contracts (scenario_master_id);

CREATE TABLE IF NOT EXISTS public.license_partner_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_store_id UUID NOT NULL REFERENCES public.license_partner_stores(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  performance_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_via TEXT NOT NULL DEFAULT 'form',
  CONSTRAINT license_partner_monthly_reports_year_check
    CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT license_partner_monthly_reports_month_check
    CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT license_partner_monthly_reports_count_check
    CHECK (performance_count >= 0),
  CONSTRAINT license_partner_monthly_reports_via_check
    CHECK (submitted_via IN ('form', 'staff')),
  UNIQUE (partner_store_id, scenario_master_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_license_partner_monthly_reports_org
  ON public.license_partner_monthly_reports (organization_id);

CREATE INDEX IF NOT EXISTS idx_license_partner_monthly_reports_period
  ON public.license_partner_monthly_reports (organization_id, year, month);

CREATE INDEX IF NOT EXISTS idx_license_partner_monthly_reports_store
  ON public.license_partner_monthly_reports (partner_store_id);

DROP TRIGGER IF EXISTS update_license_partner_stores_updated_at
  ON public.license_partner_stores;
CREATE TRIGGER update_license_partner_stores_updated_at
  BEFORE UPDATE ON public.license_partner_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_license_partner_contracts_updated_at
  ON public.license_partner_contracts;
CREATE TRIGGER update_license_partner_contracts_updated_at
  BEFORE UPDATE ON public.license_partner_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.license_partner_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_partner_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_partner_monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "license_partner_stores_select" ON public.license_partner_stores;
CREATE POLICY "license_partner_stores_select"
  ON public.license_partner_stores
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
    OR public.is_license_admin()
  );

DROP POLICY IF EXISTS "license_partner_stores_insert" ON public.license_partner_stores;
CREATE POLICY "license_partner_stores_insert"
  ON public.license_partner_stores
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_stores_update" ON public.license_partner_stores;
CREATE POLICY "license_partner_stores_update"
  ON public.license_partner_stores
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_stores_delete" ON public.license_partner_stores;
CREATE POLICY "license_partner_stores_delete"
  ON public.license_partner_stores
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_contracts_select" ON public.license_partner_contracts;
CREATE POLICY "license_partner_contracts_select"
  ON public.license_partner_contracts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
    OR public.is_license_admin()
  );

DROP POLICY IF EXISTS "license_partner_contracts_insert" ON public.license_partner_contracts;
CREATE POLICY "license_partner_contracts_insert"
  ON public.license_partner_contracts
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_contracts_update" ON public.license_partner_contracts;
CREATE POLICY "license_partner_contracts_update"
  ON public.license_partner_contracts
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_contracts_delete" ON public.license_partner_contracts;
CREATE POLICY "license_partner_contracts_delete"
  ON public.license_partner_contracts
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_monthly_reports_select" ON public.license_partner_monthly_reports;
CREATE POLICY "license_partner_monthly_reports_select"
  ON public.license_partner_monthly_reports
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
    OR public.is_license_admin()
  );

DROP POLICY IF EXISTS "license_partner_monthly_reports_insert" ON public.license_partner_monthly_reports;
CREATE POLICY "license_partner_monthly_reports_insert"
  ON public.license_partner_monthly_reports
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_monthly_reports_update" ON public.license_partner_monthly_reports;
CREATE POLICY "license_partner_monthly_reports_update"
  ON public.license_partner_monthly_reports
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "license_partner_monthly_reports_delete" ON public.license_partner_monthly_reports;
CREATE POLICY "license_partner_monthly_reports_delete"
  ON public.license_partner_monthly_reports
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.license_partner_stores FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.license_partner_contracts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.license_partner_monthly_reports FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.license_partner_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.license_partner_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.license_partner_monthly_reports TO authenticated;

COMMENT ON TABLE public.license_partner_stores IS
  'ライセンス契約先店舗（Discordチャンネル単位）。QW自店舗とは別。';
COMMENT ON TABLE public.license_partner_contracts IS
  '契約先店舗と管理作品の紐づけ。単価未設定時はシナリオの他社単価を使う。';
COMMENT ON TABLE public.license_partner_monthly_reports IS
  '契約先店舗の月次公演回数。店別報告の正。';

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
          NULLIF(os.franchise_license_amount, 0),
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
  '契約店舗の報告トークンで、その店の契約作品と指定月の回数だけを返す。無効トークンは NULL。';

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
