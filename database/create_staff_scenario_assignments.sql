-- staff_scenario_assignmentsテーブルを作成
CREATE TABLE IF NOT EXISTS staff_scenario_assignments (
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_id, scenario_id)
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_staff_scenario_assignments_staff_id ON staff_scenario_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_scenario_assignments_scenario_id ON staff_scenario_assignments(scenario_id);
CREATE INDEX IF NOT EXISTS idx_staff_scenario_assignments_assigned_at ON staff_scenario_assignments(assigned_at);

-- 既存のJSONB配列データを移行
-- 注意: このスクリプトは既存データがある場合のみ実行してください

-- スタッフのspecial_scenariosから移行
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, assigned_at, notes)
SELECT 
  s.id as staff_id,
  unnest(s.special_scenarios::UUID[]) as scenario_id,
  s.created_at as assigned_at,
  'Migrated from special_scenarios' as notes
FROM staff s
WHERE s.special_scenarios IS NOT NULL 
  AND jsonb_array_length(s.special_scenarios) > 0
ON CONFLICT (staff_id, scenario_id) DO NOTHING;

-- シナリオのavailable_gmsから移行（スタッフ名でマッチング）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, assigned_at, notes)
SELECT 
  st.id as staff_id,
  sc.id as scenario_id,
  sc.created_at as assigned_at,
  'Migrated from available_gms' as notes
FROM scenarios sc
CROSS JOIN staff st
WHERE sc.available_gms IS NOT NULL 
  AND jsonb_array_length(sc.available_gms) > 0
  AND sc.available_gms::TEXT[] @> ARRAY[st.name]
ON CONFLICT (staff_id, scenario_id) DO NOTHING;

-- 重複を削除（同じ組み合わせで複数レコードがある場合）
DELETE FROM staff_scenario_assignments 
WHERE ctid NOT IN (
  SELECT MIN(ctid) 
  FROM staff_scenario_assignments 
  GROUP BY staff_id, scenario_id
);

-- 確認用クエリ
SELECT 
  'staff_scenario_assignments' as table_name,
  COUNT(*) as record_count
FROM staff_scenario_assignments
UNION ALL
SELECT 
  'staff with special_scenarios' as table_name,
  COUNT(*) as record_count
FROM staff 
WHERE special_scenarios IS NOT NULL 
  AND jsonb_array_length(special_scenarios) > 0
UNION ALL
SELECT 
  'scenarios with available_gms' as table_name,
  COUNT(*) as record_count
FROM scenarios 
WHERE available_gms IS NOT NULL 
  AND jsonb_array_length(available_gms) > 0;
