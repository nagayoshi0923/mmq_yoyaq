-- manual_external_performances に performance_type カラムを追加
-- GMテストと通常公演の他社回数を独立して管理できるようにする

ALTER TABLE public.manual_external_performances
  ADD COLUMN IF NOT EXISTS performance_type TEXT NOT NULL DEFAULT 'normal';

COMMENT ON COLUMN public.manual_external_performances.performance_type IS '公演種別。normal=通常, gmtest=GMテスト';

-- 既存のユニーク制約を削除して performance_type を含む新しい制約に置き換える
ALTER TABLE public.manual_external_performances
  DROP CONSTRAINT IF EXISTS manual_external_performances_unique_key;

ALTER TABLE public.manual_external_performances
  ADD CONSTRAINT manual_external_performances_unique_key
    UNIQUE (organization_id, scenario_id, year, month, performance_type);

COMMENT ON CONSTRAINT manual_external_performances_unique_key ON public.manual_external_performances
  IS '組織・シナリオ・年月・公演種別の組み合わせでユニーク';

-- RPC関数を更新して performance_type を受け取れるようにする
CREATE OR REPLACE FUNCTION public.upsert_manual_external_performance(
  p_organization_id UUID,
  p_scenario_id UUID,
  p_year INTEGER,
  p_month INTEGER,
  p_performance_count INTEGER,
  p_updated_by UUID DEFAULT NULL,
  p_performance_type TEXT DEFAULT 'normal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.manual_external_performances
  WHERE organization_id = p_organization_id
    AND scenario_id     = p_scenario_id
    AND year            = p_year
    AND month           = p_month
    AND performance_type = p_performance_type;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.manual_external_performances
    SET performance_count = p_performance_count,
        updated_by        = p_updated_by,
        updated_at        = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.manual_external_performances
      (organization_id, scenario_id, year, month, performance_count, updated_by, performance_type)
    VALUES
      (p_organization_id, p_scenario_id, p_year, p_month, p_performance_count, p_updated_by, p_performance_type);
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
