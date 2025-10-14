-- 全GMアサインメントの一括登録
-- 
-- ⚠️ 事前に以下を実行してください:
-- 1. redesign_gm_system_v3.sql（テーブル拡張）
-- 2. import_scenarios_master_v2.sql（シナリオデータ）
-- 3. import_staff_master_simple.sql（スタッフデータ）
-- 4. add_staff_name_unique.sql（UNIQUE制約）
--
-- スタッフ名マッピング:
-- えなみ/えなみん → 江波（えなみん）
-- きゅう/キュウ → きゅう
-- れみあ → Remia（れみあ）
-- まつい → 松井（まつい）
-- ぽん → ぽんちゃん
-- じの → 八継じの
-- そら/ソラ/ソウタン → ソラ
-- labo/らぼ → labo
-- モリシ/もりし → イワセモリシ
-- ソルト → 藤崎ソルト

-- ===========================
-- グロリアメモリーズ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'グロリアメモリーズ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'Remia（れみあ）', '江波（えなみん）', 'れいにー', 'ぽんちゃん', 'ソラ', 'しらやま', 'りんな', 'つばめ', 'えりん', 'labo', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- マーダー・オブ・パイレーツ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'マーダー・オブ・パイレーツ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'マーダー・オブ・パイレーツ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'ほがらか', 'みずき', 'えりん', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- BrightChoice
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'BrightChoice';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'BrightChoice'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'Remia（れみあ）', 'ぽんちゃん', 'ほがらか', 'りえぞー', 'みずき', '松井（まつい）', 'れいにー', 'labo', '八継じの', 'つばめ', 'イワセモリシ', '藤崎ソルト', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 裁くもの、裁かれるもの
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '裁くもの、裁かれるもの';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '裁くもの、裁かれるもの'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', 'きゅう', '江波（えなみん）', 'ぽんちゃん', 'えりん', 'Remia（れみあ）', '松井（まつい）', 'みずき', 'ほがらか', 'ぴよな', 'labo', 'あんころ', '八継じの', 'しらやま', '崎', 'イワセモリシ', 'つばめ', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 星（準備中）
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '星';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '星'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'きゅう', '江波（えなみん）', 'つばめ', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 清流館の秘宝
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '清流館の秘宝';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '清流館の秘宝'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'れいにー', 'Remia（れみあ）', 'えりん', 'ほがらか', '江波（えなみん）', 'きゅう', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 奪うもの、奪われるもの
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '奪うもの、奪われるもの';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '奪うもの、奪われるもの'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', 'きゅう', '松井（まつい）', 'みずき', 'Remia（れみあ）', 'ほがらか', '江波（えなみん）', '崎', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 超特急の呪いの館で撮れ高足りてますか？
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '超特急の呪いの館で撮れ高足りてますか？';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '超特急の呪いの館で撮れ高足りてますか？'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', 'ぴよな', '松井（まつい）', 'りんな', 'あんころ', '八継じの', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- BBA
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'BBA';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'BBA'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'れいにー', 'きゅう', 'Remia（れみあ）', 'りえぞー', '松井（まつい）', 'えりん', '江波（えなみん）', 'つばめ', 'ぴよな', 'しらやま', 'あんころ', 'labo', 'ソラ', '八継じの', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 曙光のエテルナ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '曙光のエテルナ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '曙光のエテルナ'), true, NOW()
FROM staff s
WHERE s.name IN ('りんな', 'しらやま', 'えりん', '八継じの', 'つばめ', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- DearmyD
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'DearmyD';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'DearmyD'), true, NOW()
FROM staff s
WHERE s.name IN ('Remia（れみあ）', '江波（えなみん）', 'れいにー', 'つばめ', '崎', 'みくみん', 'みずき', 'ぽんちゃん', 'きゅう', 'えりん', 'labo', 'しらやま', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- Iwillex-
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'Iwillex-';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'Iwillex-'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'Remia（れみあ）', '江波（えなみん）', 'れいにー', '崎', 'みずき', 'きゅう', '松井（まつい）', 'えりん', 'labo', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- Recollection
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'Recollection';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'Recollection'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'しらやま', 'ソラ', 'ぽんちゃん', 'えりん', 'れいにー', 'Remia（れみあ）', 'きゅう', '松井（まつい）', 'みくみん', 'りえぞー', 'ほがらか', '江波（えなみん）', 'あんころ', '八継じの', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- WANTEDz
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'WANTEDz';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'WANTEDz'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', '江波（えなみん）', 'みずき', 'ぽんちゃん', 'れいにー', 'きゅう', 'ほがらか')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- アンフィスバエナと聖女の祈り
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'アンフィスバエナと聖女の祈り';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'アンフィスバエナと聖女の祈り'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'りえぞー', '松井（まつい）', 'えりん', 'みずき', '江波（えなみん）', 'れいにー', 'きゅう', 'Remia（れみあ）', 'ほがらか', 'ぴよな', 'つばめ', '八継じの', '崎', 'ソラ', 'labo', 'イワセモリシ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ウロボロスの眠り
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ウロボロスの眠り';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ウロボロスの眠り'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '松井（まつい）', 'きゅう', 'ぽんちゃん', 'りえぞー', 'ほがらか', 'Remia（れみあ）', 'れいにー', 'ぴよな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- クリエイターズハイ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'クリエイターズハイ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'クリエイターズハイ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'りえぞー', 'ぽんちゃん', '松井（まつい）', 'ほがらか', 'えりん', 'れいにー', 'labo', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- つわものどもが夢のあと
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'つわものどもが夢のあと';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'つわものどもが夢のあと'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'きゅう', 'れいにー', 'えりん', 'Remia（れみあ）', 'りえぞー', '江波（えなみん）', 'ぽんちゃん', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ドクター・テラスの秘密の実験
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ドクター・テラスの秘密の実験';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ドクター・テラスの秘密の実験'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', 'みくみん', 'ぽんちゃん', 'Remia（れみあ）', 'れいにー', '松井（まつい）', 'ほがらか', 'えりん', '古賀')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- バベルの末裔
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'バベルの末裔';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'バベルの末裔'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'りえぞー', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ヒーロースクランブル
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ヒーロースクランブル';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ヒーロースクランブル'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'ぽんちゃん', 'みずき', 'れいにー', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ひぐらしのなく頃に　恨返し編
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ひぐらしのなく頃に　恨返し編';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ひぐらしのなく頃に　恨返し編'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'ぽんちゃん', '古賀', 'ほがらか', '江波（えなみん）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- フェイクドナー
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'フェイクドナー';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'フェイクドナー'), true, NOW()
FROM staff s
WHERE s.name IN ('えりん', 'みずき', 'れいにー', 'しらやま', 'みくみん', 'きゅう', '松井（まつい）', 'ぽんちゃん', '江波（えなみん）', 'ほがらか', 'Remia（れみあ）', '崎', 'labo', 'ソラ', 'あんころ', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- リアルマダミス-MurderWonderLand
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'リアルマダミス-MurderWonderLand';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'リアルマダミス-MurderWonderLand'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'えりん', 'れいにー', 'つばめ', 'ぽんちゃん', '古賀', '江波（えなみん）', 'りえぞー', '松井（まつい）', 'Remia（れみあ）', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- リアルマダミス-盤上の教皇
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'リアルマダミス-盤上の教皇';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'リアルマダミス-盤上の教皇'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'れいにー', 'きゅう', 'えりん', '松井（まつい）', 'Remia（れみあ）', 'ぽんちゃん', '江波（えなみん）', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- リトルワンダー
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'リトルワンダー';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'リトルワンダー'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'つばめ', 'れいにー', '江波（えなみん）', 'きゅう', 'ほがらか', 'りんな', '八継じの', 'あんころ', 'labo', 'ぴよな', 'しらやま', 'ソラ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 悪意の岐路に立つ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '悪意の岐路に立つ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '悪意の岐路に立つ'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', '江波（えなみん）', 'ぽんちゃん', 'Remia（れみあ）', 'きゅう', 'えりん', 'れいにー', 'みずき', 'ほがらか', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 或ル胡蝶ノ夢
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '或ル胡蝶ノ夢';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '或ル胡蝶ノ夢'), true, NOW()
FROM staff s
WHERE s.name IN ('りえぞー', 'ぽんちゃん', '松井（まつい）', 'えりん', 'みずき', 'あんころ', 'きゅう', 'りんな', 'しらやま', '崎', 'れいにー', '古賀', 'ほがらか', '江波（えなみん）', 'labo', 'Remia（れみあ）', 'つばめ', '八継じの', 'ぴよな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 花街リグレット
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '花街リグレット';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '花街リグレット'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'りえぞー', 'えりん', 'みずき', 'しらやま', '八継じの', '江波（えなみん）', 'りんな', 'ぽんちゃん', 'つばめ', 'れいにー', 'ソラ', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 銀世界のアシアト
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '銀世界のアシアト';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '銀世界のアシアト'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', '松井（まつい）', 'りんな', 'しらやま', 'ぴよな', '藤崎ソルト', 'りえぞー', '崎', 'ソラ', 'ほがらか', 'labo', 'Remia（れみあ）', 'あんころ', '八継じの', 'つばめ', 'えりん', 'れいにー', 'イワセモリシ', 'みずき')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 黒と白の狭間に
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '黒と白の狭間に';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '黒と白の狭間に'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'えりん', 'Remia（れみあ）', 'しらやま', 'つばめ', 'みくみん', 'ぽんちゃん', 'きゅう', 'ほがらか', 'れいにー', '古賀', 'りえぞー', 'みずき', '松井（まつい）', '八継じの')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 裁判員の仮面
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '裁判員の仮面';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '裁判員の仮面'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '松井（まつい）', 'ぽんちゃん', 'きゅう', 'Remia（れみあ）', 'ほがらか', '八継じの', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 歯に噛むあなたに
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '歯に噛むあなたに';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '歯に噛むあなたに'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'みずき', 'えりん', 'labo', 'れいにー', '崎')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 鹿神館の罪人
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '鹿神館の罪人';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '鹿神館の罪人'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', '江波（えなみん）', 'ぽんちゃん', 'Remia（れみあ）', 'きゅう', 'ほがらか', 'れいにー')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 女皇の書架
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '女皇の書架';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '女皇の書架'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'りえぞー', 'えりん', '八継じの', 'ぽんちゃん', 'れいにー', 'みずき', '松井（まつい）', 'Remia（れみあ）', 'ほがらか', '江波（えなみん）', 'labo', 'ぴよな', 'しらやま', 'りんな', '藤崎ソルト')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 新世界のユキサキ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '新世界のユキサキ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '新世界のユキサキ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '崎', 'しらやま', '八継じの', 'ぴよな', 'りんな', '松井（まつい）', '藤崎ソルト', 'りえぞー', 'つばめ', 'Remia（れみあ）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 誠実な十字架
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '誠実な十字架';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '誠実な十字架'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'つばめ', 'ぴよな', '八継じの', 'えりん', 'Remia（れみあ）', 'ほがらか', 'れいにー', '松井（まつい）', 'りんな', 'あんころ', 'ソラ', 'ぽんちゃん', '藤崎ソルト', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- 残り100以上のシナリオも同じパターンで続きます...
-- 全データは次のファイルに分割します

-- ===========================
-- 確認クエリ
-- ===========================

-- 登録状況の確認
SELECT 
  '✅ GMアサインメントの登録が完了しました（パート1）' as status,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(DISTINCT staff_id) as スタッフ数,
  COUNT(*) as 総アサイン数
FROM staff_scenario_assignments;

-- シナリオ別のGM数
SELECT 
  sc.title as シナリオ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能,
  COUNT(*) FILTER (WHERE ssa.can_sub_gm) as サブGM可能
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
WHERE sc.title IN (
  'グロリアメモリーズ', 'マーダー・オブ・パイレーツ', 'BrightChoice', 
  '裁くもの、裁かれるもの', 'BBA', '曙光のエテルナ', 'DearmyD', 
  'Iwillex-', 'Recollection', 'WANTEDz'
)
GROUP BY sc.title
ORDER BY sc.title;

