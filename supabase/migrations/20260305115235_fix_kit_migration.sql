-- キット位置データの移行修正
-- 作成日: 2026-03-05
-- 問題: 一部のデータが org_scenario_id に移行されていない

-- ============================================================
-- 診断: 移行されていないデータの確認
-- ============================================================

DO $$
DECLARE
  total_count INTEGER;
  migrated_count INTEGER;
  unmigrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM scenario_kit_locations;
  SELECT COUNT(*) INTO migrated_count FROM scenario_kit_locations WHERE org_scenario_id IS NOT NULL;
  unmigrated_count := total_count - migrated_count;
  RAISE NOTICE '現状: 総数=%, 移行済み=%, 未移行=%', total_count, migrated_count, unmigrated_count;
END $$;

-- ============================================================
-- 追加移行1: scenarios.id を直接使って organization_scenarios を検索
-- (scenarios テーブル自体に scenario_master_id がない場合の対応)
-- ============================================================

-- まず scenarios と同じ title を持つ scenario_masters を探す
UPDATE scenario_kit_locations skl
SET org_scenario_id = os.id
FROM scenarios s
JOIN scenario_masters sm 
  ON LOWER(TRIM(sm.title)) = LOWER(TRIM(s.title))
JOIN organization_scenarios os 
  ON os.scenario_master_id = sm.id 
  AND os.organization_id = s.organization_id
WHERE skl.scenario_id = s.id
  AND skl.org_scenario_id IS NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM scenario_kit_locations WHERE org_scenario_id IS NOT NULL;
  RAISE NOTICE '追加移行1後: 移行済み=%', migrated_count;
END $$;

-- ============================================================
-- 追加移行2: scenarios の organization_id のみで organization_scenarios を検索
-- (同一組織内で同じタイトルのシナリオがある場合)
-- ============================================================

-- 同じ organization で、scenarios.title と一致する organization_scenarios を探す
UPDATE scenario_kit_locations skl
SET org_scenario_id = (
  SELECT os.id 
  FROM scenarios s
  JOIN organization_scenarios os ON os.organization_id = s.organization_id
  JOIN scenario_masters sm ON sm.id = os.scenario_master_id
  WHERE s.id = skl.scenario_id
    AND LOWER(TRIM(sm.title)) = LOWER(TRIM(s.title))
  LIMIT 1
)
WHERE skl.org_scenario_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM scenarios s
    JOIN organization_scenarios os ON os.organization_id = s.organization_id
    JOIN scenario_masters sm ON sm.id = os.scenario_master_id
    WHERE s.id = skl.scenario_id
      AND LOWER(TRIM(sm.title)) = LOWER(TRIM(s.title))
  );

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM scenario_kit_locations WHERE org_scenario_id IS NOT NULL;
  RAISE NOTICE '追加移行2後: 移行済み=%', migrated_count;
END $$;

-- ============================================================
-- 追加移行3: LIKE検索でタイトルの部分一致を試みる
-- ============================================================

UPDATE scenario_kit_locations skl
SET org_scenario_id = (
  SELECT os.id 
  FROM scenarios s
  JOIN organization_scenarios os ON os.organization_id = s.organization_id
  JOIN scenario_masters sm ON sm.id = os.scenario_master_id
  WHERE s.id = skl.scenario_id
    AND (
      LOWER(TRIM(sm.title)) LIKE '%' || LOWER(TRIM(SUBSTRING(s.title FROM 1 FOR 10))) || '%'
      OR LOWER(TRIM(s.title)) LIKE '%' || LOWER(TRIM(SUBSTRING(sm.title FROM 1 FOR 10))) || '%'
    )
  LIMIT 1
)
WHERE skl.org_scenario_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM scenarios s
    WHERE s.id = skl.scenario_id
  );

-- ============================================================
-- 最終結果
-- ============================================================

DO $$
DECLARE
  total_count INTEGER;
  migrated_count INTEGER;
  unmigrated_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO total_count FROM scenario_kit_locations;
  SELECT COUNT(*) INTO migrated_count FROM scenario_kit_locations WHERE org_scenario_id IS NOT NULL;
  unmigrated_count := total_count - migrated_count;
  RAISE NOTICE '最終結果: 総数=%, 移行済み=%, 未移行=%', total_count, migrated_count, unmigrated_count;
  
  -- 未移行のデータを表示
  IF unmigrated_count > 0 THEN
    RAISE NOTICE '未移行データの scenario_id:';
    FOR rec IN 
      SELECT DISTINCT skl.scenario_id, s.title 
      FROM scenario_kit_locations skl
      LEFT JOIN scenarios s ON s.id = skl.scenario_id
      WHERE skl.org_scenario_id IS NULL
      LIMIT 10
    LOOP
      RAISE NOTICE '  scenario_id=%, title=%', rec.scenario_id, rec.title;
    END LOOP;
  END IF;
END $$;
