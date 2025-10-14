-- 全GMアサインメントの一括登録 - パート3

-- ===========================
-- 季節マーダーシリーズ
-- ===========================

-- 季節のマーダーミステリー／ニィホン
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '季節のマーダーミステリー／ニィホン';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '季節のマーダーミステリー／ニィホン'), true, NOW()
FROM staff s WHERE s.name IN ('えりん', 'みずき', 'ぽんちゃん', 'れいにー', '崎', '松井（まつい）', 'つばめ', 'りんな', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 季節マーダー／アニクシィ
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '季節マーダー／アニクシィ';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '季節マーダー／アニクシィ'), true, NOW()
FROM staff s WHERE s.name IN ('ぽんちゃん', 'きゅう', '江波（えなみん）', 'りえぞー', 'えりん', 'Remia（れみあ）', 'れいにー', 'みずき', '崎', 'りんな', 'つばめ', 'みくみん', '古賀', 'ほがらか', 'labo', 'あんころ', '藤崎ソルト', 'しらやま', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 季節マーダー／カノケリ
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '季節マーダー／カノケリ';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '季節マーダー／カノケリ'), true, NOW()
FROM staff s WHERE s.name IN ('ぽんちゃん', 'きゅう', '江波（えなみん）', 'りえぞー', 'えりん', 'Remia（れみあ）', 'れいにー', 'みずき', '崎', 'りんな', 'ぴよな', 'つばめ', 'みくみん', 'ほがらか', 'labo', '藤崎ソルト', 'しらやま', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 季節マーダー／キモナス
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '季節マーダー／キモナス';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '季節マーダー／キモナス'), true, NOW()
FROM staff s WHERE s.name IN ('ぽんちゃん', 'れいにー', 'Remia（れみあ）', 'きゅう', '江波（えなみん）', 'りえぞー', 'えりん', '崎', 'りんな', 'みずき', 'みくみん', '松井（まつい）', 'ほがらか', 'labo', 'しらやま', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 季節マーダー／シノポロ
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '季節マーダー／シノポロ';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '季節マーダー／シノポロ'), true, NOW()
FROM staff s WHERE s.name IN ('ぽんちゃん', 'れいにー', 'Remia（れみあ）', 'きゅう', '江波（えなみん）', 'りえぞー', 'えりん', '崎', 'ぴよな', 'しらやま', 'みずき', 'りんな', 'つばめ', '松井（まつい）', '藤崎ソルト', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 鬼哭館の殺人事件
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '鬼哭館の殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '鬼哭館の殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'れいにー', '松井（まつい）', 'ソラ', 'Remia（れみあ）', 'きゅう', 'りえぞー', 'ほがらか', 'ぽんちゃん', '江波（えなみん）', 'えりん', '崎', 'ぴよな', 'labo', 'りんな', 'あんころ', '八継じの', '藤崎ソルト', 'つばめ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 古鐘のなる頃に
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '古鐘のなる頃に';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '古鐘のなる頃に'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', '江波（えなみん）', 'きゅう', 'みずき', 'ぽんちゃん', 'れいにー', 'Remia（れみあ）', 'りえぞー', 'labo', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 荒廃のマリス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '荒廃のマリス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '荒廃のマリス'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'きゅう', 'りえぞー', 'えりん', 'みずき', '江波（えなみん）', '松井（まつい）', 'れいにー', 'ほがらか', '崎', 'labo', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 黒の眺望
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '黒の眺望';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '黒の眺望'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'きゅう', 'Remia（れみあ）', '江波（えなみん）', 'つばめ', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 殺神罪
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '殺神罪';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '殺神罪'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', '松井（まつい）', 'しらやま', 'つばめ', 'ぽんちゃん', 'Remia（れみあ）', '古賀', 'ほがらか', '江波（えなみん）', 'えりん', 'きゅう', 'れいにー', '崎', 'labo', 'ぴよな', 'あんころ', 'ソラ', '八継じの', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 殺人鬼イバラノミチの回想録
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '殺人鬼イバラノミチの回想録';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '殺人鬼イバラノミチの回想録'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', 'きゅう', 'れいにー', 'えりん', 'ほがらか', 'Remia（れみあ）', '江波（えなみん）', '崎', 'labo', 'あんころ', 'ソラ', '藤崎ソルト', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 紫に染まる前に
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '紫に染まる前に';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '紫に染まる前に'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'えりん', 'みくみん', 'ぽんちゃん', 'きゅう', 'Remia（れみあ）', 'みずき', '江波（えなみん）', 'しらやま', 'つばめ', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 七股高校
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '七股高校';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '七股高校'), true, NOW()
FROM staff s
WHERE s.name IN ('みくみん', '江波（えなみん）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 朱き亡国に捧げる祈り
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '朱き亡国に捧げる祈り';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '朱き亡国に捧げる祈り'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '松井（まつい）', 'れいにー', '江波（えなみん）', 'ぽんちゃん', 'えりん', 'みずき', 'Remia（れみあ）', 'ほがらか', 'labo', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 少年少女Aの独白
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '少年少女Aの独白';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '少年少女Aの独白'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', '江波（えなみん）', 'ぽんちゃん', 'えりん', 'Remia（れみあ）', 'きゅう', '松井（まつい）', 'ほがらか', 'しらやま', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 真・渋谷陰陽奇譚
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '真・渋谷陰陽奇譚';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '真・渋谷陰陽奇譚'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', '崎', 'しらやま', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 人狼を語る館
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '人狼を語る館';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '人狼を語る館'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '松井（まつい）', 'みずき', 'れいにー', 'ぽんちゃん', '江波（えなみん）', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 星空のマリス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '星空のマリス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '星空のマリス'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'えりん', 'きゅう', '江波（えなみん）', 'りえぞー', 'みずき', '松井（まつい）', 'みくみん', 'れいにー', 'Remia（れみあ）', '古賀', 'ほがらか', '崎', 'labo', 'あんころ', 'ソラ', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 全能のパラドックス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '全能のパラドックス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '全能のパラドックス'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'ほがらか', 'イワセモリシ', 'えりん', 'れいにー', 'きゅう', '松井（まつい）', 'Remia（れみあ）', 'みずき', 'ぽんちゃん', 'しらやま', 'labo', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 探偵撲滅
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '探偵撲滅';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '探偵撲滅'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', '八継じの', 'ぽんちゃん', 'えりん', 'れいにー', 'きゅう', '松井（まつい）', 'りえぞー', 'Remia（れみあ）', 'ほがらか', '江波（えなみん）', 'labo', 'つばめ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 天邪河（あまのじゃく）
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '天邪河（あまのじゃく）';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '天邪河（あまのじゃく）'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'みずき', 'しらやま', 'ほがらか', 'れいにー', 'りんな', 'あんころ', 'つばめ', 'ぴよな', 'ソラ', '八継じの', 'labo', 'Remia（れみあ）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 電脳の檻のアリス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '電脳の檻のアリス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '電脳の檻のアリス'), true, NOW()
FROM staff s
WHERE s.name IN ('えりん', '八継じの', 'ぴよな', 'りえぞー', '江波（えなみん）', 'みずき', 'きゅう', 'つばめ', 'しらやま', 'Remia（れみあ）', 'ソラ', 'れいにー', 'イワセモリシ', 'りんな', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 白殺しType-K
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '白殺しType-K';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '白殺しType-K'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'しらやま', 'えりん', 'れいにー', 'みずき', 'Remia（れみあ）', 'ほがらか', '松井（まつい）', '江波（えなみん）', 'りえぞー', 'ぴよな', 'りんな', 'あんころ', '八継じの', 'つばめ', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 百鬼の夜、月光の影
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '百鬼の夜、月光の影';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '百鬼の夜、月光の影'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'しらやま', 'りんな', 'えりん', 'Remia（れみあ）', '古賀', 'ぽんちゃん', '江波（えなみん）', '松井（まつい）', 'れいにー', 'ぴよな', 'あんころ', '八継じの', 'つばめ', 'ソラ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 名探偵と四嶺館
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '名探偵と四嶺館';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '名探偵と四嶺館'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'れいにー', 'Remia（れみあ）', '江波（えなみん）', 'きゅう', 'ぽんちゃん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 傲慢な女王とアリスの不条理裁判
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '傲慢な女王とアリスの不条理裁判';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '傲慢な女王とアリスの不条理裁判'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'えりん', 'りえぞー', 'みずき', 'れいにー', 'りんな', 'しらやま', 'みくみん', 'きゅう', '古賀', 'ほがらか', '江波（えなみん）', '松井（まつい）', 'labo', 'つばめ', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 彗星蘭の万朶
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '彗星蘭の万朶';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '彗星蘭の万朶'), true, NOW()
FROM staff s
WHERE s.name IN ('しらやま', 'あんころ', 'りんな', '八継じの', 'えりん', 'れいにー', 'きゅう', 'みずき', 'ほがらか', '松井（まつい）', 'ソラ', '江波（えなみん）', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 燔祭のジェミニ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '燔祭のジェミニ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '燔祭のジェミニ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'りえぞー', '八継じの', 'つばめ', 'しらやま', 'りんな', 'えりん', 'れいにー', 'あんころ', 'ソラ', '松井（まつい）', 'きゅう', 'みずき')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 絆の永逝
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '絆の永逝';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '絆の永逝'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'みずき', 'えりん', 'れいにー', 'Remia（れみあ）', 'りえぞー', '松井（まつい）', 'ほがらか', '江波（えなみん）', 'しらやま', 'あんころ', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 異能特区シンギュラリティ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '異能特区シンギュラリティ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '異能特区シンギュラリティ'), true, NOW()
FROM staff s
WHERE s.name IN ('あんころ', '崎', '八継じの', '松井（まつい）', 'ぴよな', 'イワセモリシ', 'えりん', 'きゅう', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- くずの葉のもり
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'くずの葉のもり';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'くずの葉のもり'), true, NOW()
FROM staff s
WHERE s.name IN ('八継じの', 'つばめ', 'ソラ', 'りえぞー', '崎', '松井（まつい）', 'ぴよな', 'りんな', 'イワセモリシ', 'Remia（れみあ）', '藤崎ソルト', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ENIGMACODE廃棄ミライの犠牲者たち
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ENIGMACODE廃棄ミライの犠牲者たち';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ENIGMACODE廃棄ミライの犠牲者たち'), true, NOW()
FROM staff s
WHERE s.name IN ('ほがらか', '八継じの', 'Remia（れみあ）', 'つばめ', 'りんな', 'ソラ', '藤崎ソルト', 'あんころ', 'えりん', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- テセウスの方舟
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'テセウスの方舟';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'テセウスの方舟'), true, NOW()
FROM staff s
WHERE s.name IN ('ほがらか', 'つばめ', '八継じの', '藤崎ソルト', 'きゅう', 'りんな', 'labo', 'Remia（れみあ）', 'ソラ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 月光の偽桜
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '月光の偽桜';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '月光の偽桜'), true, NOW()
FROM staff s
WHERE s.name IN ('つばめ', 'ソラ', '崎', 'ぴよな', 'しらやま', '藤崎ソルト', 'えりん', 'きゅう', 'りんな', 'Remia（れみあ）', 'あんころ', 'イワセモリシ', '八継じの', '松井（まつい）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 蟻集
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '蟻集';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '蟻集'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '崎', 'ぴよな', 'りんな', 'えりん', 'labo', 'みずき', 'つばめ', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 蝉散
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '蝉散';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '蝉散'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '崎', 'ぴよな', 'りんな', 'えりん', 'labo', 'みずき')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 確認クエリ
SELECT 
  '✅ パート3完了' as status,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(*) as アサイン数
FROM staff_scenario_assignments;

