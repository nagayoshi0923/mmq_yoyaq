-- scenario_mastersからscenariosテーブルにも情報を同期
-- 作成日: 2026-03-02
-- 概要: 一覧（organization_scenarios_with_master）とダイアログ（scenarios）の
--       データ齟齬を解消するため、マスタの情報をscenariosにも反映

-- ============================================================
-- メイン更新処理：scenario_masters → scenarios
-- ============================================================

UPDATE scenarios s
SET
  -- 基本情報
  title = sm.title,
  author = sm.author,
  key_visual_url = COALESCE(sm.key_visual_url, s.key_visual_url),
  description = COALESCE(sm.description, s.description),
  
  -- ゲーム設定
  player_count_min = sm.player_count_min,
  player_count_max = sm.player_count_max,
  duration = sm.official_duration,
  genre = COALESCE(sm.genre, s.genre),
  
  -- メタ情報
  updated_at = NOW()
FROM scenario_masters sm
WHERE s.scenario_master_id = sm.id
  AND s.organization_id = 'a0000000-0000-0000-0000-000000000001'
  AND s.scenario_master_id IS NOT NULL;

-- ============================================================
-- 更新結果の確認
-- ============================================================

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM scenarios s
  JOIN scenario_masters sm ON sm.id = s.scenario_master_id
  WHERE s.organization_id = 'a0000000-0000-0000-0000-000000000001'
    AND s.scenario_master_id IS NOT NULL;
  
  RAISE NOTICE '更新完了: %件のscenariosレコードをマスタから同期しました', updated_count;
END $$;
