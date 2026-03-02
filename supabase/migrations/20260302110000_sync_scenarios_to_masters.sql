-- クインズワルツのscenariosテーブルからscenario_mastersに情報を反映
-- 作成日: 2026-03-02
-- 概要: scenariosに登録されている最新情報をscenario_mastersに同期する

-- ============================================================
-- 前提確認: scenario_master_id で紐付いているシナリオのみ更新対象
-- ============================================================

-- 更新対象の確認クエリ（実行前に確認用）
-- SELECT 
--   s.title as scenario_title,
--   sm.title as master_title,
--   s.author as scenario_author,
--   sm.author as master_author,
--   s.player_count_min, sm.player_count_min as master_min,
--   s.player_count_max, sm.player_count_max as master_max,
--   s.duration, sm.official_duration as master_duration
-- FROM scenarios s
-- JOIN scenario_masters sm ON sm.id = s.scenario_master_id
-- WHERE s.organization_id = 'a0000000-0000-0000-0000-000000000001'
-- ORDER BY s.title;

-- ============================================================
-- メイン更新処理
-- ============================================================

UPDATE scenario_masters sm
SET
  -- 基本情報
  title = s.title,
  author = s.author,
  key_visual_url = COALESCE(s.key_visual_url, sm.key_visual_url),
  description = COALESCE(s.description, sm.description),
  
  -- ゲーム設定
  player_count_min = s.player_count_min,
  player_count_max = s.player_count_max,
  official_duration = s.duration,
  genre = COALESCE(s.genre, sm.genre),
  
  -- メタ情報
  updated_at = NOW()
FROM scenarios s
WHERE s.scenario_master_id = sm.id
  AND s.organization_id = 'a0000000-0000-0000-0000-000000000001'
  AND s.scenario_master_id IS NOT NULL;

-- ============================================================
-- 更新結果の確認
-- ============================================================

-- 更新されたレコード数を表示
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM scenarios s
  JOIN scenario_masters sm ON sm.id = s.scenario_master_id
  WHERE s.organization_id = 'a0000000-0000-0000-0000-000000000001'
    AND s.scenario_master_id IS NOT NULL;
  
  RAISE NOTICE '更新完了: %件のシナリオマスタを更新しました', updated_count;
END $$;

-- 確認用: 更新後のデータ
-- SELECT 
--   sm.id,
--   sm.title,
--   sm.author,
--   sm.player_count_min,
--   sm.player_count_max,
--   sm.official_duration,
--   sm.genre,
--   sm.updated_at
-- FROM scenario_masters sm
-- WHERE sm.id IN (
--   SELECT scenario_master_id 
--   FROM scenarios 
--   WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'
--     AND scenario_master_id IS NOT NULL
-- )
-- ORDER BY sm.title;
