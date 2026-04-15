-- 自社公演数の手動上書きを保存するテーブル
-- scenarioKey = UUID (通常) or UUID_gmtest (GMテスト)
CREATE TABLE IF NOT EXISTS public.manual_internal_performance_overrides (
  id               UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL,
  scenario_key     TEXT        NOT NULL,  -- "uuid" or "uuid_gmtest"
  year             INTEGER     NOT NULL,
  month            INTEGER     NOT NULL,
  performance_count INTEGER    NOT NULL DEFAULT 0,
  updated_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT manual_internal_performance_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT manual_internal_performance_overrides_unique
    UNIQUE (organization_id, scenario_key, year, month)
);

COMMENT ON TABLE public.manual_internal_performance_overrides IS '自社公演数の手動上書き（送信レポート用）';

-- RLS
ALTER TABLE public.manual_internal_performance_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY manual_internal_overrides_select ON public.manual_internal_performance_overrides
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ));

CREATE POLICY manual_internal_overrides_insert ON public.manual_internal_performance_overrides
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ));

CREATE POLICY manual_internal_overrides_update ON public.manual_internal_performance_overrides
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ));

-- Upsert RPC
CREATE OR REPLACE FUNCTION public.upsert_manual_internal_performance_override(
  p_organization_id UUID,
  p_scenario_key    TEXT,
  p_year            INTEGER,
  p_month           INTEGER,
  p_performance_count INTEGER,
  p_updated_by      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.manual_internal_performance_overrides
  WHERE organization_id = p_organization_id
    AND scenario_key    = p_scenario_key
    AND year            = p_year
    AND month           = p_month;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.manual_internal_performance_overrides
    SET performance_count = p_performance_count,
        updated_by        = p_updated_by,
        updated_at        = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.manual_internal_performance_overrides
      (organization_id, scenario_key, year, month, performance_count, updated_by)
    VALUES
      (p_organization_id, p_scenario_key, p_year, p_month, p_performance_count, p_updated_by);
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_manual_internal_performance_override(UUID, TEXT, INTEGER, INTEGER, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
