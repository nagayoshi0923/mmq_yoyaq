-- GMアサインメントの一括登録テンプレート
-- 
-- ⚠️ 事前に以下を実行してください:
-- 1. redesign_gm_system_v3.sql（テーブル拡張）
-- 2. import_scenarios_master_v2.sql（シナリオデータ）
-- 3. import_staff_master_simple.sql（スタッフデータ）

-- ===========================
-- グロリアメモリーズ
-- ===========================

-- シナリオ設定（GM1人）
UPDATE scenarios 
SET requires_sub_gm = false, gm_count_required = 1 
WHERE title = 'グロリアメモリーズ';

-- メインGM可能なスタッフ
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT 
  s.id,
  (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'),
  true,
  NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'Remia（れみあ）', '江波（えなみん）', 'れいにー', 'ぽんちゃん', 'ソラ', 'しらやま', 'りんな', 'つばめ', 'えりん', 'labo', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- モノクローム（2人GM必要）
-- ===========================

-- シナリオ設定（GM2人）
UPDATE scenarios 
SET requires_sub_gm = true, gm_count_required = 2 
WHERE title = 'モノクローム';

-- メイン・サブ両方可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT 
  s.id,
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  true,
  true,
  NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = true, can_sub_gm = true, can_gm_at = NOW();

-- メインのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT 
  s.id,
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  true,
  false,
  NOW()
FROM staff s
WHERE s.name IN ('えりん', '崎', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = true, can_sub_gm = false, can_gm_at = NOW();

-- サブのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT 
  s.id,
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  false,
  true,
  NOW()
FROM staff s
WHERE s.name IN ('みずき', 'きゅう', 'labo', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = false, can_sub_gm = true, can_gm_at = NOW();

-- ===========================
-- BrightChoice
-- ===========================

UPDATE scenarios 
SET requires_sub_gm = false, gm_count_required = 1 
WHERE title = 'BrightChoice';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT 
  s.id,
  (SELECT id FROM scenarios WHERE title = 'BrightChoice'),
  true,
  NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'Remia（れみあ）', 'ぽんちゃん', 'ほがらか', 'りえぞー', 'みずき', '松井（まつい）', 'れいにー', 'labo', '八継じの', 'つばめ', 'イワセモリシ', '藤崎ソルト', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- BBA
-- ===========================

UPDATE scenarios 
SET requires_sub_gm = false, gm_count_required = 1 
WHERE title = 'BBA';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT 
  s.id,
  (SELECT id FROM scenarios WHERE title = 'BBA'),
  true,
  NOW()
FROM staff s
WHERE s.name IN ('みずき', 'れいにー', 'きゅう', 'Remia（れみあ）', 'りえぞー', '松井（まつい）', 'えりん', '江波（えなみん）', 'つばめ', 'ぴよな', 'しらやま', 'あんころ', 'labo', 'ソラ', '八継じの', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 確認クエリ
-- ===========================

-- 登録状況の確認
SELECT 
  sc.title as シナリオ名,
  sc.requires_sub_gm as サブGM必要,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能人数,
  COUNT(*) FILTER (WHERE ssa.can_sub_gm) as サブGM可能人数,
  COUNT(*) FILTER (WHERE ssa.is_experienced) as 体験済み人数
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
WHERE sc.title IN ('グロリアメモリーズ', 'モノクローム', 'BrightChoice', 'BBA')
GROUP BY sc.title, sc.requires_sub_gm
ORDER BY sc.title;

-- スタッフ別のGM可能シナリオ数
SELECT 
  s.name as スタッフ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能,
  COUNT(*) FILTER (WHERE ssa.can_sub_gm) as サブGM可能,
  COUNT(*) FILTER (WHERE ssa.is_experienced) as 体験済み
FROM staff s
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
WHERE 'gm' = ANY(s.role)
GROUP BY s.name
ORDER BY COUNT(*) FILTER (WHERE ssa.can_main_gm) DESC
LIMIT 20;

/*
残りのシナリオも同じパターンで追加してください：

-- シナリオ名
UPDATE scenarios SET requires_sub_gm = false/true, gm_count_required = 1/2 WHERE title = 'シナリオ名';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'シナリオ名'), true/false, true/false, NOW()
FROM staff s
WHERE s.name IN ('スタッフ1', 'スタッフ2', ...)
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true/false, can_sub_gm = true/false, can_gm_at = NOW();
*/

