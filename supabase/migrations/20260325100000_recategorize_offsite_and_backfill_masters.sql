-- 出張系イベントのoffsite再分類 + 未登録シナリオのマスター登録・紐付け
-- 作成日: 2026-03-25
-- 概要:
--   Step 1: 出張系34件をcategory='offsite'に変更
--   Step 2: マスター未登録の通常シナリオ453種をscenario_mastersに登録
--   Step 3: schedule_events.scenario_master_idを紐付け（新規登録分 + 既存一致分）

-- ============================================================
-- Step 1: 出張系イベントを offsite カテゴリに変更
-- open/private等に入っているが実際は出張公演のもの
-- ============================================================

UPDATE schedule_events
SET category = 'offsite'
WHERE scenario_master_id IS NULL
  AND scenario IS NOT NULL
  AND scenario != ''
  AND scenario LIKE '%出張%'
  AND category IN ('open', 'private', 'gmtest', 'testplay', 'package');

-- ============================================================
-- Step 2: マスター未登録の通常シナリオを scenario_masters に登録
-- メモ的なエントリ（キット作成・営業外・シフト等）は除外
-- ============================================================

INSERT INTO scenario_masters (title, master_status)
SELECT DISTINCT TRIM(se.scenario), 'approved'
FROM schedule_events se
WHERE se.scenario IS NOT NULL
  AND se.scenario != ''
  AND se.scenario_master_id IS NULL
  AND se.category IN ('open', 'private', 'gmtest', 'testplay', 'package')
  -- メモ的エントリを除外
  AND NOT (
    se.scenario LIKE '%営業外%'
    OR se.scenario LIKE '%シフト%'
    OR se.scenario LIKE '%清掃%'
    OR se.scenario LIKE '%キット%'
    OR se.scenario LIKE '%移動%'
    OR se.scenario LIKE '%病院%'
    OR se.scenario LIKE '%不在%'
    OR se.scenario LIKE '%研修%'
    OR se.scenario LIKE '%休み%'
    OR se.scenario LIKE '%準備%'
    OR se.scenario LIKE '%設営%'
    OR se.scenario LIKE '%撤去%'
    OR se.scenario LIKE '%見学%'
    OR se.scenario LIKE '%打ち合わせ%'
    OR se.scenario LIKE '%会議%'
    OR se.scenario LIKE '%配信%'
    OR se.scenario LIKE '%ミーティング%'
    OR se.scenario LIKE '%搬入%'
    OR se.scenario LIKE '%搬出%'
    OR se.scenario LIKE '%朝エナミン%'
    OR se.scenario LIKE '%トラワレ%'
    OR se.scenario LIKE '%確認%'
    OR se.scenario LIKE '%稽古%'
    OR se.scenario LIKE '%仕込み%'
    OR se.scenario LIKE '%10~13%'
  )
  -- 既にscenario_mastersに同名が存在するものは除外
  AND NOT EXISTS (
    SELECT 1 FROM scenario_masters sm
    WHERE TRIM(sm.title) = TRIM(se.scenario)
  );

-- ============================================================
-- Step 3: schedule_events.scenario_master_id を紐付け
-- 通常カテゴリのイベントでタイトル一致するものを紐付け
-- ============================================================

UPDATE schedule_events se
SET scenario_master_id = (
  SELECT sm.id
  FROM scenario_masters sm
  WHERE TRIM(sm.title) = TRIM(se.scenario)
  LIMIT 1
)
WHERE se.scenario_master_id IS NULL
  AND se.scenario IS NOT NULL
  AND se.scenario != ''
  AND se.category IN ('open', 'private', 'gmtest', 'testplay', 'package')
  AND EXISTS (
    SELECT 1 FROM scenario_masters sm
    WHERE TRIM(sm.title) = TRIM(se.scenario)
  );

-- ============================================================
-- 確認
-- ============================================================

DO $$
DECLARE
  offsite_count INTEGER;
  masters_created INTEGER;
  events_linked INTEGER;
  still_null_scenario INTEGER;
  still_null_memo INTEGER;
BEGIN
  -- offsite再分類された件数
  SELECT COUNT(*) INTO offsite_count
  FROM schedule_events
  WHERE category = 'offsite'
    AND scenario LIKE '%出張%';

  -- 新規作成されたマスター数（approvedで最近作成）
  SELECT COUNT(*) INTO masters_created
  FROM scenario_masters
  WHERE master_status = 'approved'
    AND created_at > NOW() - INTERVAL '1 minute';

  -- 紐付け済みイベント数
  SELECT COUNT(*) INTO events_linked
  FROM schedule_events
  WHERE scenario_master_id IS NOT NULL
    AND scenario IS NOT NULL
    AND scenario != '';

  -- まだnullの通常カテゴリイベント（メモ除く）
  SELECT COUNT(*) INTO still_null_scenario
  FROM schedule_events
  WHERE scenario_master_id IS NULL
    AND scenario IS NOT NULL
    AND scenario != ''
    AND category IN ('open', 'private', 'gmtest', 'testplay', 'package')
    AND NOT (
      scenario LIKE '%営業外%' OR scenario LIKE '%シフト%' OR scenario LIKE '%清掃%'
      OR scenario LIKE '%キット%' OR scenario LIKE '%移動%' OR scenario LIKE '%病院%'
      OR scenario LIKE '%不在%' OR scenario LIKE '%研修%' OR scenario LIKE '%休み%'
      OR scenario LIKE '%準備%' OR scenario LIKE '%設営%' OR scenario LIKE '%撤去%'
      OR scenario LIKE '%見学%' OR scenario LIKE '%打ち合わせ%' OR scenario LIKE '%会議%'
      OR scenario LIKE '%配信%' OR scenario LIKE '%ミーティング%' OR scenario LIKE '%搬入%'
      OR scenario LIKE '%搬出%' OR scenario LIKE '%朝エナミン%' OR scenario LIKE '%トラワレ%'
      OR scenario LIKE '%確認%' OR scenario LIKE '%稽古%' OR scenario LIKE '%仕込み%'
      OR scenario LIKE '%10~13%'
    );

  -- まだnullのメモ件数
  SELECT COUNT(*) INTO still_null_memo
  FROM schedule_events
  WHERE scenario_master_id IS NULL
    AND scenario IS NOT NULL
    AND scenario != ''
    AND category IN ('open', 'private', 'gmtest', 'testplay', 'package');

  RAISE NOTICE '========================================';
  RAISE NOTICE '出張系 → offsite再分類: %件', offsite_count;
  RAISE NOTICE '新規マスター登録: %件', masters_created;
  RAISE NOTICE 'シナリオ紐付け済み（全体）: %件', events_linked;
  RAISE NOTICE '未紐付け（シナリオ、メモ除く）: %件', still_null_scenario;
  RAISE NOTICE '未紐付け（メモ含む全体）: %件', still_null_memo;
  RAISE NOTICE '========================================';
END $$;
