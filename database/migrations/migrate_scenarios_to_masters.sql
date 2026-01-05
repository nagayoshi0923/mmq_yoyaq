-- シナリオデータ移行スクリプト
-- 作成日: 2026-01-05
-- 概要: 既存の scenarios テーブルから scenario_masters + organization_scenarios へ移行

-- ============================================================
-- 注意事項
-- ============================================================
-- ・既存の scenarios テーブルは削除しない（段階的移行のため）
-- ・schedule_events.scenario_id は既存のまま維持
-- ・新テーブルへの移行後、API/UIを段階的に切り替え

-- ============================================================
-- 1. scenarios → scenario_masters へ移行
-- ============================================================

INSERT INTO scenario_masters (
  id,  -- 既存IDを維持（外部キー参照のため）
  title,
  author,
  key_visual_url,
  description,
  player_count_min,
  player_count_max,
  official_duration,
  genre,
  difficulty,
  master_status,
  submitted_by_organization_id,
  created_at,
  updated_at
)
SELECT
  s.id,
  s.title,
  s.author,
  s.key_visual_url,
  s.description,
  s.player_count_min,
  s.player_count_max,
  s.duration,
  s.genre,
  CASE 
    WHEN s.difficulty <= 2 THEN 'beginner'
    WHEN s.difficulty <= 4 THEN 'intermediate'
    ELSE 'advanced'
  END,
  'approved',  -- 既存シナリオは承認済みとする
  s.organization_id,
  s.created_at,
  s.updated_at
FROM scenarios s
WHERE NOT EXISTS (
  -- 既に移行済みのデータはスキップ
  SELECT 1 FROM scenario_masters sm WHERE sm.id = s.id
)
ON CONFLICT (id) DO NOTHING;

-- 移行件数を確認
SELECT 'Migrated to scenario_masters: ' || COUNT(*) as result FROM scenario_masters;

-- ============================================================
-- 2. scenarios → organization_scenarios へ移行
-- ============================================================

-- organization_idがNULLのシナリオはスキップ

INSERT INTO organization_scenarios (
  organization_id,
  scenario_master_id,
  slug,
  duration,
  participation_fee,
  extra_preparation_time,
  org_status,
  pricing_patterns,
  gm_assignments,
  created_at,
  updated_at
)
SELECT
  s.organization_id,
  s.id,  -- scenario_master_id = 元のscenario.id
  s.slug,
  s.duration,
  s.participation_fee,
  COALESCE(s.extra_preparation_time, 0),
  CASE 
    WHEN s.status = 'available' THEN 'available'
    WHEN s.status = 'maintenance' THEN 'unavailable'
    ELSE 'unavailable'
  END,
  '[]'::jsonb,  -- pricing_patterns（後で手動設定）
  '[]'::jsonb,  -- gm_assignments（後で手動設定）
  s.created_at,
  s.updated_at
FROM scenarios s
WHERE s.organization_id IS NOT NULL
  AND NOT EXISTS (
    -- 既に移行済みのデータはスキップ
    SELECT 1 FROM organization_scenarios os 
    WHERE os.scenario_master_id = s.id 
      AND os.organization_id = s.organization_id
  )
ON CONFLICT (organization_id, scenario_master_id) DO NOTHING;

-- 移行件数を確認
SELECT 'Migrated to organization_scenarios: ' || COUNT(*) as result FROM organization_scenarios;

-- ============================================================
-- 3. 移行結果の確認
-- ============================================================

-- マスタとの結合ビューで確認
SELECT 
  'Total scenarios in view: ' || COUNT(*) as result 
FROM organization_scenarios_with_master;

-- 詳細確認（最初の5件）
SELECT 
  title,
  author,
  duration,
  master_status,
  org_status
FROM organization_scenarios_with_master
LIMIT 5;

-- 完了メッセージ
SELECT 'Migration completed successfully!' as result;
