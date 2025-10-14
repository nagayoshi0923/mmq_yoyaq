-- 正しいGMアサインメントをインポート (Part 8/15)
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
WHERE s.name = '八継じの'
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '探偵撲滅'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
WHERE s.name = 'みずき'
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '天邪河（あまのじゃく）'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
WHERE s.name = 'ミカノハ'
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '電脳の檻のアリス'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
WHERE s.name = 'えりん'
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '白殺しType-K'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
WHERE s.name = 'りんな'
  AND sc.title = '百鬼の夜、月光の影'
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
WHERE s.name = 'えりん'
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
WHERE s.name = '古賀'
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
WHERE s.name = 'ミカノハ'
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '百鬼の夜、月光の影'
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
  AND sc.title = '名探偵と四嶺館'
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
  AND sc.title = '名探偵と四嶺館'
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
  AND sc.title = '名探偵と四嶺館'
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
  AND sc.title = '名探偵と四嶺館'
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
  AND sc.title = '名探偵と四嶺館'
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
  AND sc.title = '名探偵と四嶺館'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
WHERE s.name = 'えりん'
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
WHERE s.name = 'みずき'
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
WHERE s.name = 'りんな'
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
WHERE s.name = '古賀'
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
  AND sc.title = '傲慢な女王とアリスの不条理裁判'
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
WHERE s.name = 'しらやま'
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
WHERE s.name = 'りんな'
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
WHERE s.name = 'えりん'
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '彗星蘭の万朶'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
WHERE s.name = 'りんな'
  AND sc.title = '燔祭のジェミニ'
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
WHERE s.name = 'えりん'
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
WHERE s.name = 'ミカノハ'
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '燔祭のジェミニ'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
WHERE s.name = 'ミカノハ'
  AND sc.title = '絆の永逝'
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
  AND sc.title = '絆の永逝'
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
WHERE s.name = '奏兎'
  AND sc.title = '絆の永逝'
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
WHERE s.name = 'あんころ'
  AND sc.title = '異能特区シンギュラリティ'
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
WHERE s.name = '崎'
  AND sc.title = '異能特区シンギュラリティ'
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
  AND sc.title = '異能特区シンギュラリティ'
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
  AND sc.title = '異能特区シンギュラリティ'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;

SELECT '✅ Part 8/15 のインポートが完了しました' as status;
