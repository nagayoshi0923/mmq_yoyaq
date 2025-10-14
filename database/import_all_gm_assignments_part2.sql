-- 全GMアサインメントの一括登録 - パート2
-- パート1の続き

-- ===========================
-- 鉄紺の証言
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '鉄紺の証言';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '鉄紺の証言'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'ぽんちゃん', '松井（まつい）', 'ほがらか', 'Remia（れみあ）', 'labo', 'れいにー', 'りんな', 'ソラ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 霧に眠るは幾つの罪
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '霧に眠るは幾つの罪';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '霧に眠るは幾つの罪'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '松井（まつい）', 'きゅう', 'れいにー', '崎', 'ほがらか', 'みずき', 'えりん', 'ぽんちゃん', 'りえぞー', 'あんころ', 'labo', 'ソラ', '藤崎ソルト', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 野槌
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '野槌';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '野槌'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '江波（えなみん）', 'ほがらか', 'Remia（れみあ）', '松井（まつい）', 'れいにー', 'りえぞー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 機巧人形の心臓
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '機巧人形の心臓';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '機巧人形の心臓'), true, NOW()
FROM staff s
WHERE s.name IN ('八継じの', 'ぴよな', 'きゅう', 'つばめ', 'しらやま', '藤崎ソルト', 'りえぞー', 'ソラ', 'あんころ', 'イワセモリシ', 'りんな', 'labo', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 境界線のカーサスベリ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '境界線のカーサスベリ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '境界線のカーサスベリ'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', 'つばめ', '崎', 'しらやま', '藤崎ソルト', 'りんな', 'Remia（れみあ）', 'ぴよな', 'イワセモリシ', '八継じの', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 藍雨廻逢
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '藍雨廻逢';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '藍雨廻逢'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', 'ぴよな', 'つばめ', '八継じの', 'りんな', 'えりん', 'Remia（れみあ）', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- inthebox～長い熱病
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'inthebox～長い熱病';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'inthebox～長い熱病'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', '八継じの', '崎', 'りんな', 'きゅう', 'ソラ', 'つばめ', 'イワセモリシ', '松井（まつい）', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- GARDENリーガー殺人事件
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'GARDENリーガー殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'GARDENリーガー殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'みずき', 'れいにー', '江波（えなみん）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- Jazzy
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'Jazzy';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'Jazzy'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'きゅう', '江波（えなみん）', 'つばめ', '崎', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- REDRUM01泉涌館の変転
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'REDRUM01泉涌館の変転';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'REDRUM01泉涌館の変転'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', 'えりん', 'labo', '松井（まつい）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- アオハループ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'アオハループ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'アオハループ'), true, NOW()
FROM staff s
WHERE s.name IN ('みくみん', 'みずき', 'りえぞー', 'しらやま', 'ぽんちゃん', 'つばめ', 'りんな', 'えりん', 'れいにー', 'きゅう', '松井（まつい）', '古賀', '江波（えなみん）', 'ほがらか', 'Remia（れみあ）', 'ぴよな', 'あんころ', 'ソラ', '八継じの', 'イワセモリシ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- あくなき世界で嘘をうたう
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'あくなき世界で嘘をうたう';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'あくなき世界で嘘をうたう'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', '江波（えなみん）', 'みずき', 'りんな', 'みくみん', 'えりん', '松井（まつい）', 'きゅう', 'Remia（れみあ）', 'れいにー', 'つばめ', 'ぴよな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- エデンの審判
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'エデンの審判';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'エデンの審判'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '崎', 'ぽんちゃん', 'れいにー', 'ほがらか', '松井（まつい）', '江波（えなみん）', 'Remia（れみあ）', 'みずき', 'えりん', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- キングを殺すには
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'キングを殺すには';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'キングを殺すには'), true, NOW()
FROM staff s
WHERE s.name IN ('Remia（れみあ）', 'きゅう', 'みずき', 'りえぞー', 'ほがらか', '江波（えなみん）', 'れいにー', '崎', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- クロノフォビア
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'クロノフォビア';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'クロノフォビア'), true, NOW()
FROM staff s
WHERE s.name IN ('ほがらか', 'りえぞー', 'きゅう', 'つばめ', 'イワセモリシ', '江波（えなみん）', 'Remia（れみあ）', 'れいにー', '松井（まつい）', 'ぽんちゃん', 'えりん', 'みずき', '崎', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- スターループ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'スターループ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'スターループ'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'れいにー', '八継じの', 'ぴよな', 'しらやま', '江波（えなみん）', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ツグミドリ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ツグミドリ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ツグミドリ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'りえぞー', 'きゅう', 'りんな', 'ソラ', 'えりん', '松井（まつい）', 'しらやま', 'れいにー', 'ぴよな', 'あんころ', '八継じの', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ナナイロの迷宮 黄
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'みずき', 'れいにー', 'きゅう', 'Remia（れみあ）', 'えりん', '古賀', 'ほがらか', '江波（えなみん）', 'つばめ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ナナイロの迷宮 緑
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ナナイロの迷宮 緑 アペイロン研究所殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ナナイロの迷宮 緑 アペイロン研究所殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'Remia（れみあ）', 'りえぞー', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ナナイロの迷宮 橙
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ナナイロの迷宮 橙 オンラインゲーム殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ナナイロの迷宮 橙 オンラインゲーム殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'みずき', 'れいにー', 'えりん', 'きゅう', 'Remia（れみあ）', '古賀', 'ほがらか', '松井（まつい）', '江波（えなみん）', 'つばめ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ピタゴラスの篝火
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ピタゴラスの篝火';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ピタゴラスの篝火'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', '江波（えなみん）', 'Remia（れみあ）', 'みずき', 'ぽんちゃん', 'れいにー', 'えりん', 'labo', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ヤノハのフタリ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ヤノハのフタリ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ヤノハのフタリ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'りえぞー', 'ぽんちゃん', 'れいにー', 'きゅう', 'みずき', 'しらやま', 'labo', '藤崎ソルト', 'つばめ', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ロックドドア殺人
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ロックドドア殺人';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ロックドドア殺人'), true, NOW()
FROM staff s
WHERE s.name IN ('みくみん', '江波（えなみん）', 'りえぞー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 一条家の人々
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '一条家の人々';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '一条家の人々'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'ぽんちゃん', '松井（まつい）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 花咲の箱庭
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '花咲の箱庭';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '花咲の箱庭'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'ぽんちゃん', 'Remia（れみあ）', '江波（えなみん）', '松井（まつい）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 学校の解談
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '学校の解談';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '学校の解談'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'りえぞー', 'えりん', '江波（えなみん）', 'みくみん', 'ぽんちゃん', 'きゅう', '松井（まつい）', 'ほがらか', 'れいにー', 'Remia（れみあ）', 'ぴよな', 'りんな', 'あんころ', 'つばめ', 'labo', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 確認クエリ
SELECT 
  '✅ パート2完了' as status,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(*) as アサイン数
FROM staff_scenario_assignments;

