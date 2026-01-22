-- 既存の scenarios を organization_scenarios に移行
-- 作成日: 2026-01-22
-- 概要: scenario_master_id が設定されているシナリオを organization_scenarios に登録

DO $$
DECLARE
  scenario_rec RECORD;
  org_id UUID := 'a0000000-0000-0000-0000-000000000001'; -- クインズワルツの組織ID
  migrated_count INTEGER := 0;
  skipped_count INTEGER := 0;
BEGIN
  -- scenario_master_id が設定されているシナリオを処理
  FOR scenario_rec IN 
    SELECT DISTINCT
      s.scenario_master_id,
      s.organization_id,
      s.slug,
      s.duration,
      s.participation_fee,
      s.status,
      s.available_stores,
      s.gm_assignments,
      s.pricing_patterns
    FROM scenarios s
    WHERE s.scenario_master_id IS NOT NULL
      AND s.organization_id = org_id
      AND NOT EXISTS (
        SELECT 1 
        FROM organization_scenarios os 
        WHERE os.scenario_master_id = s.scenario_master_id 
          AND os.organization_id = s.organization_id
      )
    ORDER BY s.scenario_master_id
  LOOP
    -- organization_scenarios に登録
    INSERT INTO organization_scenarios (
      organization_id,
      scenario_master_id,
      slug,
      duration,
      participation_fee,
      org_status,
      pricing_patterns,
      gm_assignments,
      extra_preparation_time
    ) VALUES (
      scenario_rec.organization_id,
      scenario_rec.scenario_master_id,
      scenario_rec.slug,
      scenario_rec.duration,
      scenario_rec.participation_fee,
      CASE 
        WHEN scenario_rec.status = 'available' THEN 'available'
        WHEN scenario_rec.status = 'unavailable' THEN 'unavailable'
        WHEN scenario_rec.status = 'draft' THEN 'coming_soon'
        ELSE 'unavailable'
      END,
      COALESCE(scenario_rec.pricing_patterns::jsonb, '[]'::jsonb),
      COALESCE(scenario_rec.gm_assignments::jsonb, '[]'::jsonb),
      0
    )
    ON CONFLICT (organization_id, scenario_master_id) DO NOTHING;
    
    IF FOUND THEN
      migrated_count := migrated_count + 1;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '移行完了: % 件登録、% 件スキップ', migrated_count, skipped_count;
END $$;

-- 確認用クエリ
-- SELECT COUNT(*) FROM organization_scenarios WHERE organization_id = 'a0000000-0000-0000-0000-000000000001';

