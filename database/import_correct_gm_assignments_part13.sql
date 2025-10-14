-- 正しいGMアサインメントをインポート (Part 13/15)
-- 
-- 生成日時: 自動生成（マッピング適用済み）
-- 
-- 実行順序:
-- 0. database/add_new_staff_from_gm_data.sql （新規スタッフがいる場合）
-- 1. database/delete_all_gm_assignments.sql （初回のみ）
-- 2. database/import_correct_gm_assignments_part1.sql
-- 3. database/import_correct_gm_assignments_part2.sql
-- ... (順番に実行)

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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'エイダ'
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
  AND sc.title = 'ブラックナイトスレイヴ'
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
  AND sc.title = 'ブラックナイトスレイヴ'
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
  AND sc.title = 'ブラックナイトスレイヴ'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = 'ユートピアース'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　2.5　頂上戦争'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　陰謀の分水嶺（１）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　星降る天辺（２）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
WHERE s.name = 'りえぞー'
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '狂気山脈　薄明三角点（３）'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '午前2時7分'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part1'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
WHERE s.name = 'きゅう'
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
  AND sc.title = '黒い森の獣part2人と狼'
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
WHERE s.name = 'つばめ'
  AND sc.title = '魂を運ぶ飛行船'
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
  AND sc.title = '魂を運ぶ飛行船'
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
WHERE s.name = '藤崎ソルト'
  AND sc.title = '魂を運ぶ飛行船'
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
WHERE s.name = '奏兎'
  AND sc.title = '魂を運ぶ飛行船'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '人類最後の皆様へ／終末の眠り姫'
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
  AND sc.title = '正義はまた蘇る'
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
WHERE s.name = '松井（まつい）'
  AND sc.title = '正義はまた蘇る'
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
  AND sc.title = '正義はまた蘇る'
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
  AND sc.title = '正義はまた蘇る'
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
  AND sc.title = '正義はまた蘇る'
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
  AND sc.title = '正義はまた蘇る'
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
  AND sc.title = '正義はまた蘇る'
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
  AND sc.title = '天使は花明かりの下で'
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
  AND sc.title = '天使は花明かりの下で'
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
  AND sc.title = '天使は花明かりの下で'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;

SELECT '✅ Part 13/15 のインポートが完了しました' as status;
