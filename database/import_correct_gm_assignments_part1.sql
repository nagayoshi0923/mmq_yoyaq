-- 正しいGMアサインメントをインポート (Part 1/15)
-- 
-- 生成日時: 自動生成（マッピング適用済み）
-- 
-- 実行順序:
-- 0. database/add_new_staff_from_gm_data.sql （新規スタッフがいる場合）
-- 1. database/delete_all_gm_assignments.sql （初回のみ）
-- 2. database/import_correct_gm_assignments_part1.sql
-- 3. database/import_correct_gm_assignments_part2.sql
-- ... (順番に実行)

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ソウタン'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'しらやま'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'りんな'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'labo'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '崎'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽったー'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '藤崎ソルト'
  AND sc.title = 'グロリアメモリーズ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = 'マーダー・オブ・パイレーツ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ほがらか'
  AND sc.title = 'マーダー・オブ・パイレーツ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = 'マーダー・オブ・パイレーツ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'マーダー・オブ・パイレーツ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'マーダー・オブ・パイレーツ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ほがらか'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'りえぞー'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'labo'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽったー'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '藤崎ソルト'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'イワセモリシ'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'BrightChoice'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ほがらか'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぴよな'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'labo'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'あんころ'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'しらやま'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'だいこん'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽったー'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '崎'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'イワセモリシ'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ソラ'
  AND sc.title = '裁くもの、裁かれるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'りえぞー'
  AND sc.title = '星'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = '星'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = '星'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = '星'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = '星'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'あんころ'
  AND sc.title = '星'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ほがらか'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = '清流館の秘宝'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ほがらか'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '崎'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = '奪うもの、奪われるもの'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ソラ'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぴよな'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'あんころ'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'りんな'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽったー'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'kanade'
  AND sc.title = '超特急の呪いの館で撮れ高足りてますか？'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'りえぞー'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぴよな'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'しらやま'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'あんころ'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'labo'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ソラ'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽったー'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'イワセモリシ'
  AND sc.title = 'BBA'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'しらやま'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'りんな'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'あんころ'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '温風リン'
  AND sc.title = '曙光のエテルナ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'つばめ'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '崎'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みくみん'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'labo'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'しらやま'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ソラ'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '渚咲'
  AND sc.title = 'DearmyD'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '江波（えなみん）'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '崎'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'labo'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '八継じの'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽったー'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '渚咲'
  AND sc.title = 'Iwillex-'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みずき'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'しらやま'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ソラ'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'ぽん'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'えりん'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'れいにー'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'Remia（れみあ）'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'きゅう'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '松井（まつい）'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = 'みくみん'
  AND sc.title = 'Recollection'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

SELECT '✅ Part 1/15 のインポートが完了しました' as status;
