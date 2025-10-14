-- 全GMアサインメントの一括登録 - パート6（最終）

-- ===========================
-- SORCIER～賢者達の物語～
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'SORCIER～賢者達の物語～';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'SORCIER～賢者達の物語～'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'みずき', 'つばめ', 'みくみん', '江波（えなみん）', 'ほがらか', 'しらやま', '八継じの', 'りんな')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- あの夏のアンタレス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'あの夏のアンタレス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'あの夏のアンタレス'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', 'ぽんちゃん', 'Remia（れみあ）', '古賀', '江波（えなみん）', 'しらやま')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- エンドロールは流れない
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'エンドロールは流れない';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'エンドロールは流れない'), true, NOW()
FROM staff s
WHERE s.name IN ('みずき', 'あんころ', 'ぽんちゃん', 'ソラ', '藤崎ソルト', 'えりん', '古賀', '松井（まつい）', '江波（えなみん）', 'ほがらか', 'Remia（れみあ）', 'れいにー', 'きゅう', 'しらやま', '崎', 'ぴよな', 'labo', 'りんな', 'つばめ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 幻想のマリス
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '幻想のマリス';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '幻想のマリス'), true, NOW()
FROM staff s
WHERE s.name IN ('れいにー', 'きゅう', '江波（えなみん）', 'みずき', 'みくみん', 'えりん', 'Remia（れみあ）', '松井（まつい）', 'りえぞー', 'ほがらか', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- Invisible-亡霊列車-
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'Invisible-亡霊列車-';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'Invisible-亡霊列車-'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', '八継じの', 'ソラ', 'きゅう', 'つばめ', '古賀', 'あんころ', 'りんな', 'しらやま', '藤崎ソルト', 'えりん', '松井（まつい）', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 口裂け女の微笑み・Mの悪意
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '口裂け女の微笑み・Mの悪意';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '口裂け女の微笑み・Mの悪意'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- Grape
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'Grape';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'Grape'), true, NOW()
FROM staff s
WHERE s.name IN ('八継じの', 'きゅう', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- Factor
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'Factor';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'Factor'), true, NOW()
FROM staff s
WHERE s.name IN ('つばめ', 'きゅう', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 親方の館
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '親方の館';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '親方の館'), true, NOW()
FROM staff s
WHERE s.name IN ('ソラ', 'ぴよな', 'あんころ', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- アンシンメトリー
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'アンシンメトリー';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'アンシンメトリー'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう', 'ソラ', 'つばめ', '藤崎ソルト', 'Remia（れみあ）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 妖怪たちと月夜の刀
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '妖怪たちと月夜の刀';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '妖怪たちと月夜の刀'), true, NOW()
FROM staff s
WHERE s.name IN ('崎', '八継じの', 'ソラ', 'つばめ', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ある悪魔の儀式について
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ある悪魔の儀式について';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ある悪魔の儀式について'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'Remia（れみあ）', 'しらやま', '八継じの', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ブルーダイヤの不在証明
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ブルーダイヤの不在証明';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ブルーダイヤの不在証明'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'きゅう', '崎', '八継じの', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ツイン号沈没事件に関する考察
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ツイン号沈没事件に関する考察';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ツイン号沈没事件に関する考察'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'えりん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 深海に沈む子供たち（水底に生きる）
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '深海に沈む子供たち（水底に生きる）';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '深海に沈む子供たち（水底に生きる）'), true, NOW()
FROM staff s
WHERE s.name IN ('つばめ', '藤崎ソルト', 'あんころ', 'ぴよな', 'ソラ', 'きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- その白衣は誰が為に
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'その白衣は誰が為に';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'その白衣は誰が為に'), true, NOW()
FROM staff s
WHERE s.name IN ('きゅう')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 探ぱんマーダーミステリー・ノーショーツトルダム学園殺人事件
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '探ぱんマーダーミステリー・ノーショーツトルダム学園殺人事件';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '探ぱんマーダーミステリー・ノーショーツトルダム学園殺人事件'), true, NOW()
FROM staff s
WHERE s.name IN ('八継じの', 'きゅう', 'りんな', 'Remia（れみあ）', '藤崎ソルト', 'あんころ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 岐路に降り立つ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '岐路に降り立つ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '岐路に降り立つ'), true, NOW()
FROM staff s
WHERE s.name IN ('松井（まつい）', 'きゅう', 'Remia（れみあ）', '江波（えなみん）', 'ぽんちゃん', 'りえぞー', 'みずき', 'れいにー', 'ほがらか', 'えりん', 'labo', 'ソラ', 'つばめ', 'イワセモリシ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 想いは満天の星に
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '想いは満天の星に';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '想いは満天の星に'), true, NOW()
FROM staff s
WHERE s.name IN ('えりん', 'みずき', '松井（まつい）', 'Remia（れみあ）', '古賀', '江波（えなみん）', 'りえぞー', 'きゅう', 'れいにー', 'labo')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 今日も涙の雨が降る
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '今日も涙の雨が降る';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '今日も涙の雨が降る'), true, NOW()
FROM staff s
WHERE s.name IN ('ほがらか', 'えりん', 'Remia（れみあ）', '松井（まつい）', '江波（えなみん）', 'ぽんちゃん')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- アオハルーツ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'アオハルーツ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'アオハルーツ'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）', 'りえぞー', 'みずき', 'Remia（れみあ）', 'ほがらか', 'れいにー', 'えりん', 'ぽんちゃん', '松井（まつい）', 'つばめ', 'ソラ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- キヲクの方舟
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'キヲクの方舟';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'キヲクの方舟'), true, NOW()
FROM staff s
WHERE s.name IN ('ぽんちゃん', 'みずき', 'きゅう', '松井（まつい）', 'りえぞー', '江波（えなみん）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- ブラックナイトスレイヴ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'ブラックナイトスレイヴ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'ブラックナイトスレイヴ'), true, NOW()
FROM staff s
WHERE s.name IN ('えりん', 'Remia（れみあ）', '江波（えなみん）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- フェイクアブダクション
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'フェイクアブダクション';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = 'フェイクアブダクション'), true, NOW()
FROM staff s
WHERE s.name IN ('江波（えなみん）')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 贖罪のロザリオ
-- ===========================
UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = '贖罪のロザリオ';

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
SELECT s.id, (SELECT id FROM scenarios WHERE title = '贖罪のロザリオ'), true, NOW()
FROM staff s
WHERE s.name IN ('えりん', 'れいにー', '江波（えなみん）', 'きゅう', 'Remia（れみあ）', 'ソラ', 'つばめ')
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();

-- ===========================
-- 最終確認
-- ===========================

SELECT 
  '✅ 全GMアサインメントの登録が完了しました！' as status,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(DISTINCT staff_id) as スタッフ数,
  COUNT(*) as 総アサイン数,
  COUNT(*) FILTER (WHERE can_main_gm) as メインGM可能数,
  COUNT(*) FILTER (WHERE can_sub_gm) as サブGM可能数,
  COUNT(*) FILTER (WHERE is_experienced) as 体験済み数
FROM staff_scenario_assignments;

-- スタッフ別のGM可能シナリオ数ランキング
SELECT 
  s.name as スタッフ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能,
  COUNT(*) FILTER (WHERE ssa.can_sub_gm) as サブGM可能,
  COUNT(*) FILTER (WHERE ssa.is_experienced) as 体験済み
FROM staff s
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
WHERE 'gm' = ANY(s.role) OR ssa.staff_id IS NOT NULL
GROUP BY s.name
HAVING COUNT(*) FILTER (WHERE ssa.can_main_gm OR ssa.can_sub_gm OR ssa.is_experienced) > 0
ORDER BY COUNT(*) FILTER (WHERE ssa.can_main_gm) DESC
LIMIT 30;

-- シナリオ別のGM数ランキング
SELECT 
  sc.title as シナリオ名,
  sc.requires_sub_gm as サブGM必要,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能人数,
  COUNT(*) FILTER (WHERE ssa.can_sub_gm) as サブGM可能人数
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
GROUP BY sc.title, sc.requires_sub_gm
HAVING COUNT(*) FILTER (WHERE ssa.can_main_gm OR ssa.can_sub_gm) > 0
ORDER BY COUNT(*) FILTER (WHERE ssa.can_main_gm) DESC
LIMIT 30;

-- サブGMが必要なシナリオの確認
SELECT 
  sc.title as シナリオ名,
  sc.gm_count_required as 必要GM数,
  STRING_AGG(
    CASE 
      WHEN ssa.can_main_gm AND ssa.can_sub_gm THEN s.name || '(両方)'
      WHEN ssa.can_main_gm THEN s.name || '(メイン)'
      WHEN ssa.can_sub_gm THEN s.name || '(サブ)'
    END,
    ', '
    ORDER BY ssa.can_main_gm DESC, ssa.can_sub_gm DESC, s.name
  ) as GM可能スタッフ
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
LEFT JOIN staff s ON ssa.staff_id = s.id
WHERE sc.requires_sub_gm = true
GROUP BY sc.title, sc.gm_count_required
ORDER BY sc.title;

