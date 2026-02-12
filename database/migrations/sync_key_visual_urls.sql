-- key_visual_url の同期漏れを修正
-- 作成日: 2026-02-09
-- 概要: scenarios テーブルに画像URLがあるのに、
--       scenario_masters や organization_scenarios に反映されていないデータを一括同期

-- ============================================================
-- 1. 現状確認
-- ============================================================
SELECT '同期が必要なシナリオ（scenarios に画像があるが scenario_masters にない）' as check_name;
SELECT s.id, s.title, s.key_visual_url, sm.key_visual_url as master_kv
FROM scenarios s
JOIN scenario_masters sm ON sm.id = s.scenario_master_id
WHERE s.key_visual_url IS NOT NULL 
  AND s.key_visual_url != ''
  AND (sm.key_visual_url IS NULL OR sm.key_visual_url = '');

SELECT '同期が必要なシナリオ（scenarios に画像があるが organization_scenarios にない）' as check_name;
SELECT s.id, s.title, s.key_visual_url, os.custom_key_visual_url
FROM scenarios s
JOIN organization_scenarios os ON os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
WHERE s.key_visual_url IS NOT NULL 
  AND s.key_visual_url != ''
  AND (os.custom_key_visual_url IS NULL OR os.custom_key_visual_url = '');

-- ============================================================
-- 2. scenario_masters に key_visual_url を同期
-- ============================================================
UPDATE scenario_masters sm
SET key_visual_url = s.key_visual_url,
    updated_at = NOW()
FROM scenarios s
WHERE sm.id = s.scenario_master_id
  AND s.key_visual_url IS NOT NULL 
  AND s.key_visual_url != ''
  AND (sm.key_visual_url IS NULL OR sm.key_visual_url = '');

SELECT 'scenario_masters 同期完了: ' || COUNT(*) || '件' as result
FROM scenario_masters WHERE key_visual_url IS NOT NULL AND key_visual_url != '';

-- ============================================================
-- 3. organization_scenarios に custom_key_visual_url を同期
-- ============================================================
UPDATE organization_scenarios os
SET custom_key_visual_url = s.key_visual_url,
    updated_at = NOW()
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.key_visual_url IS NOT NULL 
  AND s.key_visual_url != ''
  AND (os.custom_key_visual_url IS NULL OR os.custom_key_visual_url = '');

SELECT 'organization_scenarios 同期完了' as result;

-- ============================================================
-- 4. 修正後の確認
-- ============================================================
SELECT '修正後: 画像あり scenario_masters' as check_name,
  COUNT(*) as count
FROM scenario_masters 
WHERE key_visual_url IS NOT NULL AND key_visual_url != '';

SELECT '修正後: まだ同期漏れがあるケース' as check_name;
SELECT s.id, s.title
FROM scenarios s
JOIN scenario_masters sm ON sm.id = s.scenario_master_id
WHERE s.key_visual_url IS NOT NULL 
  AND s.key_visual_url != ''
  AND (sm.key_visual_url IS NULL OR sm.key_visual_url = '');
