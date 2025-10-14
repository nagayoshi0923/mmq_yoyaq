-- 全GMアサインメントの一括登録 - パート5

-- ===========================
-- 不思議の国の童話裁判（2人GM必要）
-- ===========================
UPDATE scenarios SET requires_sub_gm = true, gm_count_required = 2 WHERE title = '不思議の国の童話裁判';

-- メイン・サブ（アリス）両方可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '不思議の国の童話裁判'), true, true, NOW()
FROM staff s WHERE s.name IN ('みずき', 'りえぞー', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_sub_gm = true, can_gm_at = NOW();

-- メインのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '不思議の国の童話裁判'), true, false, NOW()
FROM staff s WHERE s.name IN ('つばめ', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_sub_gm = false, can_gm_at = NOW();

-- サブ（アリス）のみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '不思議の国の童話裁判'), false, true, NOW()
FROM staff s WHERE s.name IN ('きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = false, can_sub_gm = true, can_gm_at = NOW();

-- その他GM可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '不思議の国の童話裁判'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'れいにー', 'Remia（れみあ）', 'りえぞー', '古賀', 'ほがらか', '江波（えなみん）', 'しらやま', 'りんな', 'あんころ', 'ぴよな', 'ソラ')
  AND s.name NOT IN ('みずき', 'えりん', 'つばめ', '八継じの', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 鳴神様のいうとおり
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '鳴神様のいうとおり';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '鳴神様のいうとおり'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'きゅう', '江波（えなみん）', 'りえぞー', 'みずき', '松井（まつい）', 'れいにー', 'Remia（れみあ）', 'ほがらか', 'labo', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 立方館
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '立方館';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '立方館'), true, NOW()
FROM staff s
WHERE s.name IN ('labo', '松井（まつい）', 'きゅう', 'しらやま', 'つばめ', '藤崎ソルト', '崎', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 裂き子さん
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '裂き子さん';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '裂き子さん'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', 'みずき', 'きゅう', 'ぴよな', 'つばめ', 'みくみん', 'Remia（れみあ）', 'れいにー', 'ほがらか', '江波（えなみん）', '松井（まつい）', 'えりん', 'しらやま', '八継じの', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ゴージャスマンション
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ゴージャスマンション';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ゴージャスマンション'), true, NOW()
FROM staff s
WHERE s.name IN ('しらやま', 'ぴよな', 'りんな', 'あんころ', '八継じの', 'イワセモリシ', 'えりん', 'Remia（れみあ）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- マーダーオブエクスプローラー失われし大秘宝
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'マーダーオブエクスプローラー失われし大秘宝';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'マーダーオブエクスプローラー失われし大秘宝'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', '八継じの', '古賀', 'あんころ', 'りんな', 'つばめ', 'えりん', 'きゅう', 'Remia（れみあ）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 漣の向こう側
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '漣の向こう側';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '漣の向こう側'), true, NOW()
FROM staff s
WHERE s.name IN ('八継じの', 'つばめ', 'ぴよな', 'あんころ', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 土牢に悲鳴は谺して
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '土牢に悲鳴は谺して';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '土牢に悲鳴は谺して'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'きゅう', 'えりん', 'りんな', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- オペレーション：ゴーストウィング
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'オペレーション：ゴーストウィング';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'オペレーション：ゴーストウィング'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'ソラ', 'りんな', 'labo', 'Remia（れみあ）', 'つばめ', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- GM殺人事件
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'GM殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'GM殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('八継じの', 'りんな', 'あんころ', 'つばめ', '藤崎ソルト', 'ぴよな', 'ソラ', 'labo', 'しらやま', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- BeatSpecter
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'BeatSpecter';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'BeatSpecter'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'ソラ', 'あんころ', 'labo', 'れいにー', 'Remia（れみあ）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- WORLDEND
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'WORLDEND';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'WORLDEND'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', 'あんころ', 'つばめ', 'きゅう', '松井（まつい）', 'みずき', 'Remia（れみあ）', '江波（えなみん）', 'しらやま', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- あるマーダーミステリーについて
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'あるマーダーミステリーについて';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'あるマーダーミステリーについて'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '松井（まつい）', 'Remia（れみあ）', 'りえぞー', 'えりん', 'れいにー', 'labo', 'しらやま', '藤崎ソルト', 'ほがらか', 'みずき', 'きゅう', 'ぽんちゃん', '崎', 'ぴよな', 'ソラ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- エイダ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'エイダ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'エイダ'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'みずき', '藤崎ソルト', 'しらやま', 'あんころ', 'みくみん', 'ぽんちゃん', 'えりん', 'れいにー', 'Remia（れみあ）', 'きゅう', '松井（まつい）', '古賀', 'ほがらか', '江波（えなみん）', '崎', 'ぴよな', 'labo', '八継じの', 'つばめ', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ユートピアース
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ユートピアース';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ユートピアース'), true, NOW()
FROM staff s
WHERE s.name IN ('しらやま', '八継じの', 'つばめ', 'あんころ', 'れいにー', 'りんな', 'きゅう', 'みずき')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 狂気山脈シリーズ
-- ===========================

-- 狂気山脈　2.5　頂上戦争
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '狂気山脈　2.5　頂上戦争';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '狂気山脈　2.5　頂上戦争'), true, NOW()
FROM staff s WHERE s.name IN ('れいにー', 'Remia（れみあ）', '江波（えなみん）', '崎', 'みずき', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 狂気山脈　陰謀の分水嶺（１）
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '狂気山脈　陰謀の分水嶺（１）';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '狂気山脈　陰謀の分水嶺（１）'), true, NOW()
FROM staff s WHERE s.name IN ('れいにー', 'Remia（れみあ）', 'みずき', 'ぽんちゃん', 'えりん', '古賀', 'りえぞー', '松井（まつい）', 'ほがらか', '江波（えなみん）', 'しらやま', '崎', 'ぴよな', 'labo', 'あんころ', 'つばめ', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 狂気山脈　星降る天辺（２）
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '狂気山脈　星降る天辺（２）';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '狂気山脈　星降る天辺（２）'), true, NOW()
FROM staff s WHERE s.name IN ('れいにー', 'Remia（れみあ）', 'みずき', 'えりん', 'りえぞー', '松井（まつい）', '江波（えなみん）', 'しらやま', '崎', 'labo', 'あんころ', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 狂気山脈　薄明三角点（３）
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '狂気山脈　薄明三角点（３）';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '狂気山脈　薄明三角点（３）'), true, NOW()
FROM staff s WHERE s.name IN ('れいにー', 'Remia（れみあ）', 'りえぞー', 'えりん', 'みずき', '江波（えなみん）', 'しらやま', '崎', 'labo', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 午前2時7分
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '午前2時7分';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '午前2時7分'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'Remia（れみあ）', 'れいにー', 'みずき', 'ぽんちゃん', 'えりん', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 黒い森の獣シリーズ
-- ===========================

-- 黒い森の獣part1
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '黒い森の獣part1';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '黒い森の獣part1'), true, NOW()
FROM staff s WHERE s.name IN ('松井（まつい）', 'れいにー', 'ぽんちゃん', 'きゅう', '古賀', 'りえぞー', 'ほがらか', '江波（えなみん）', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 黒い森の獣part2人と狼
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '黒い森の獣part2人と狼';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '黒い森の獣part2人と狼'), true, NOW()
FROM staff s WHERE s.name IN ('松井（まつい）', 'れいにー', 'きゅう', 'Remia（れみあ）', '古賀', 'ほがらか', '江波（えなみん）', 'みずき', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 魂を運ぶ飛行船
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '魂を運ぶ飛行船';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '魂を運ぶ飛行船'), true, NOW()
FROM staff s
WHERE s.name IN ('つばめ', 'りんな', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 人類最後の皆様へ／終末の眠り姫
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '人類最後の皆様へ／終末の眠り姫';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '人類最後の皆様へ／終末の眠り姫'), true, NOW()
FROM staff s
WHERE s.name IN ('あんころ', 'えりん', 'Remia（れみあ）', 'ぽんちゃん', '古賀', 'みずき', '江波（えなみん）', '崎', 'ぴよな', 'labo', 'つばめ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 正義はまた蘇る
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '正義はまた蘇る';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '正義はまた蘇る'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '松井（まつい）', 'みずき', 'ぽんちゃん', 'れいにー', 'きゅう', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 天使は花明かりの下で
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '天使は花明かりの下で';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '天使は花明かりの下で'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'みずき', 'ぴよな', 'ぽんちゃん', 'しらやま', 'あんころ', '古賀', 'えりん', 'れいにー', '江波（えなみん）', 'つばめ', 'ソラ', '藤崎ソルト', '八継じの', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 南極地点X
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '南極地点X';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '南極地点X'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', '松井（まつい）', 'ぽんちゃん', 'Remia（れみあ）', 'ほがらか', '江波（えなみん）', 'あんころ', '藤崎ソルト', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 僕らの未来について
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '僕らの未来について';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '僕らの未来について'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'ぽんちゃん', 'Remia（れみあ）', 'ほがらか', '江波（えなみん）', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 魔女の聖餐式
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '魔女の聖餐式';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '魔女の聖餐式'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'ぽんちゃん', 'えりん', 'Remia（れみあ）', '松井（まつい）', '古賀', 'れいにー', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 流年
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '流年';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '流年'), true, NOW()
FROM staff s
WHERE s.name IN ('えりん', 'れいにー', 'イワセモリシ', 'あんころ', 'ぽんちゃん', 'みずき', 'Remia（れみあ）', 'ほがらか', 'きゅう', 'ぴよな', 'つばめ', 'しらやま', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 廻る弾丸輪舞（ダンガンロンド）
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '廻る弾丸輪舞（ダンガンロンド）';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '廻る弾丸輪舞（ダンガンロンド）'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'ソラ', '八継じの', 'えりん', 'Remia（れみあ）', 'あんころ', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- TheRealFork30's
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'TheRealFork30''s';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'TheRealFork30''s'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', 'りえぞー', 'ぴよな', 'りんな', 'あんころ', '八継じの', 'イワセモリシ', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 檻見る5人/空色時箱セット
-- ===========================

-- 檻見る5人-（空色時箱セット公演）
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '檻見る5人-（空色時箱セット公演）';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '檻見る5人-（空色時箱セット公演）'), true, NOW()
FROM staff s WHERE s.name IN ('ソラ', 'つばめ', '八継じの', 'ぴよな', 'イワセモリシ', 'あんころ', 'しらやま', 'りえぞー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 空色時箱（ソライロタイムカプセル）-檻見る５人セット公演
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '空色時箱（ソライロタイムカプセル）-檻見る５人セット公演';
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '空色時箱（ソライロタイムカプセル）-檻見る５人セット公演'), true, NOW()
FROM staff s WHERE s.name IN ('つばめ', 'ソラ', '八継じの', 'イワセモリシ', '江波（えなみん）', 'あんころ', 'しらやま', 'りえぞー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- MissingLink（ミッシングリンク）
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'MissingLink（ミッシングリンク）';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'MissingLink（ミッシングリンク）'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '崎', 'しらやま', 'ソラ', '八継じの', 'あんころ', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ゼロの爆弾
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ゼロの爆弾';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ゼロの爆弾'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', '八継じの', 'きゅう', '江波（えなみん）', 'しらやま', 'Remia（れみあ）', 'りんな', 'あんころ', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 赤鬼が泣いた夜
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '赤鬼が泣いた夜';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '赤鬼が泣いた夜'), true, NOW()
FROM staff s
WHERE s.name IN ('つばめ', 'あんころ', 'ぴよな', '松井（まつい）', 'ソラ', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 確認クエリ
SELECT 
  '✅ パート5完了' as status,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(*) as アサイン数
FROM staff_scenario_assignments;

