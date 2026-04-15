-- 前2マイグレーション適用後のスキーマキャッシュ強制リフレッシュ
-- license_report_history の新カラムと upsert_manual_external_performance の新シグネチャを反映

-- upsert_manual_external_performance を GRANT 付きで再作成（キャッシュ確実化）
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
  WHERE organization_id  = p_organization_id
    AND scenario_id      = p_scenario_id
    AND year             = p_year
    AND month            = p_month
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

GRANT EXECUTE ON FUNCTION public.upsert_manual_external_performance(UUID, UUID, INTEGER, INTEGER, INTEGER, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
