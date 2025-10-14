-- 全GMアサインメントの一括登録 - パート4

-- ===========================
-- 5DIVE
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '5DIVE';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '5DIVE'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '八継じの', 'しらやま', 'ぴよな', 'Remia（れみあ）', 'みずき', 'りえぞー', '江波（えなみん）', 'れいにー', '松井（まつい）', 'ぽんちゃん', '崎', 'labo', 'りんな', 'あんころ', 'つばめ', 'えりん', 'ソラ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- MERCHANT
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'MERCHANT';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'MERCHANT'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'えりん', 'きゅう', '古賀', 'ぽんちゃん', '江波（えなみん）', 'しらやま', '崎', 'ぴよな', 'あんころ', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- readme.txt
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'readme.txt';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'readme.txt'), true, NOW()
FROM staff s
WHERE s.name IN ('ほがらか', 'ぽんちゃん', 'きゅう', 'えりん', '松井（まつい）', '江波（えなみん）', 'れいにー', '崎', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- REDRUMシリーズ
-- ===========================

-- REDRUM02虚像のF
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'REDRUM02虚像のF';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'REDRUM02虚像のF'), true, NOW()
FROM staff s WHERE s.name IN ('ソラ', 'えりん', '松井（まつい）', 'あんころ', '藤崎ソルト', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- REDRUM03致命的観測をもう一度
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'REDRUM03致命的観測をもう一度';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'REDRUM03致命的観測をもう一度'), true, NOW()
FROM staff s WHERE s.name IN ('labo', 'ソラ', 'しらやま', 'えりん', 'れいにー', '藤崎ソルト', '八継じの', '松井（まつい）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- REDRUM4アルテミスの断罪
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'REDRUM4アルテミスの断罪';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'REDRUM4アルテミスの断罪'), true, NOW()
FROM staff s WHERE s.name IN ('ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- TOOLS～ぎこちない椅子
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'TOOLS～ぎこちない椅子';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'TOOLS～ぎこちない椅子'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'れいにー', '松井（まつい）', 'みずき', 'Remia（れみあ）', '江波（えなみん）', 'えりん', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- アンドロイドは愛を知らない
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'アンドロイドは愛を知らない';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'アンドロイドは愛を知らない'), true, NOW()
FROM staff s
WHERE s.name IN ('つばめ', 'しらやま', '八継じの', 'イワセモリシ', 'りんな', '藤崎ソルト', 'ぴよな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- クリムゾンアート
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'クリムゾンアート';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'クリムゾンアート'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', 'Remia（れみあ）', 'きゅう', 'みずき', '江波（えなみん）', 'ほがらか', 'れいにー', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- この闇をあなたと
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'この闇をあなたと';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'この闇をあなたと'), true, NOW()
FROM staff s
WHERE s.name IN ('Remia（れみあ）', '松井（まつい）', 'しらやま', 'ソラ', '江波（えなみん）', '八継じの', 'きゅう', 'ほがらか', 'れいにー', 'みずき', '崎', 'ぴよな', 'りんな', 'あんころ', 'つばめ', 'えりん', 'labo', 'イワセモリシ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- デモンズボックス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'デモンズボックス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'デモンズボックス'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'つばめ', 'ぽんちゃん', 'Remia（れみあ）', 'きゅう', '松井（まつい）', 'ほがらか', 'れいにー', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- へっどぎあ★ぱにっく
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'へっどぎあ★ぱにっく';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'へっどぎあ★ぱにっく'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'つばめ', 'きゅう', 'しらやま', 'ぽんちゃん', '松井（まつい）', 'りえぞー', 'みずき', 'れいにー', 'ほがらか', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- モノクローム（2人GM必要）
-- ===========================
UPDATE scenarios SET requires_sub_gm = true, gm_count_required = 2 WHERE title = 'モノクローム';

-- メイン・サブ両方可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'モノクローム'), true, true, NOW()
FROM staff s WHERE s.name IN ('りえぞー', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_sub_gm = true, can_gm_at = NOW();

-- メインのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'モノクローム'), true, false, NOW()
FROM staff s WHERE s.name IN ('えりん', '崎', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_sub_gm = false, can_gm_at = NOW();

-- サブのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'モノクローム'), false, true, NOW()
FROM staff s WHERE s.name IN ('みずき', 'きゅう', 'labo', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = false, can_sub_gm = true, can_gm_at = NOW();

-- その他のGM可能スタッフ（詳細不明なのでメインGM可能として登録）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'モノクローム'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'れいにー', 'Remia（れみあ）', 'ほがらか', '松井（まつい）', '江波（えなみん）', 'ソラ', 'りんな', 'あんころ', 'ぴよな', 'つばめ', '藤崎ソルト')
  AND s.name NOT IN ('りえぞー', 'しらやま', 'えりん', '崎', '八継じの', 'みずき', 'きゅう', 'labo', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ロスト／リメンブランス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ロスト／リメンブランス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ロスト／リメンブランス'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'Remia（れみあ）', 'れいにー', 'labo', '江波（えなみん）', 'みずき', 'えりん', 'ほがらか', 'ぽんちゃん', 'しらやま', '崎', 'あんころ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 愛する故に
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '愛する故に';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '愛する故に'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', 'みずき', 'イワセモリシ', 'ソラ', 'ぽんちゃん', 'ほがらか', '江波（えなみん）', 'きゅう', '崎', 'あんころ', 'えりん', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 椅子戦争
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '椅子戦争';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '椅子戦争'), true, NOW()
FROM staff s
WHERE s.name IN ('ほがらか', 'りえぞー', 'ぽんちゃん', 'えりん', 'Remia（れみあ）', 'きゅう', 'れいにー', '江波（えなみん）', 'ぴよな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 違人
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '違人';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '違人'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'labo', 'みずき', 'ぽんちゃん', 'えりん', 'Remia（れみあ）', 'れいにー', '松井（まつい）', '古賀', '江波（えなみん）', '八継じの', 'りんな', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 火ノ神様のいうとおり
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '火ノ神様のいうとおり';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '火ノ神様のいうとおり'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '江波（えなみん）', '松井（まつい）', 'みずき', 'れいにー', 'ほがらか', 'Remia（れみあ）', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 紅く舞う
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '紅く舞う';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '紅く舞う'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'きゅう', 'えりん', 'れいにー', 'みずき', 'Remia（れみあ）', 'ほがらか', '江波（えなみん）', 'つばめ', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 告別詩（取引中止）
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '告別詩（取引中止）';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '告別詩（取引中止）'), true, NOW()
FROM staff s
WHERE s.name IN ('しらやま', 'ぴよな', 'りえぞー', 'イワセモリシ', '八継じの', 'ソラ', '松井（まつい）', 'labo', 'みずき', 'あんころ', 'ほがらか', 'りんな', '江波（えなみん）', '藤崎ソルト', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 殺人鬼Xの独白
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '殺人鬼Xの独白';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '殺人鬼Xの独白'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'Remia（れみあ）', 'れいにー', 'ほがらか', 'えりん', '江波（えなみん）', '古賀', 'みずき', 'ぽんちゃん', 'ソラ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 小暮事件に関する考察
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '小暮事件に関する考察';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '小暮事件に関する考察'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '松井（まつい）', 'Remia（れみあ）', 'labo', 'ソラ', 'ほがらか', 'えりん', '古賀', 'みずき', 'ぽんちゃん', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 赤の導線
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '赤の導線';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '赤の導線'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', '江波（えなみん）', 'えりん', 'りえぞー', 'しらやま', 'ぴよな', 'きゅう', 'Remia（れみあ）', 'ぽんちゃん', '古賀', 'みずき', '崎', 'あんころ', '八継じの', 'つばめ', 'ソラ', '藤崎ソルト', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 凍てつくあなたに６つの灯火
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '凍てつくあなたに６つの灯火';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '凍てつくあなたに６つの灯火'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'えりん', '松井（まつい）', 'あんころ', 'みくみん', '江波（えなみん）', 'ほがらか', 'れいにー', 'きゅう', 'みずき', 'つばめ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 彼とかじつとマシュマロウ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '彼とかじつとマシュマロウ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '彼とかじつとマシュマロウ'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', '藤崎ソルト', 'つばめ', 'みくみん', '松井（まつい）', '江波（えなみん）', 'ほがらか', 'えりん', 'れいにー', 'labo', 'ぴよな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 彼女といるかとチョコレート
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '彼女といるかとチョコレート';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '彼女といるかとチョコレート'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', 'えりん', '藤崎ソルト', 'みくみん', 'きゅう', '松井（まつい）', '江波（えなみん）', 'ほがらか', 'みずき', 'れいにー', 'labo', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 確認クエリ
SELECT 
  '✅ パート4完了' as status,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(*) as アサイン数
FROM staff_scenario_assignments;

