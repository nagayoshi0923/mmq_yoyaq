-- ============================================================
-- シナリオタイトル変更時に公演スケジュールを自動更新するトリガー
-- 作成日: 2026-03-19
-- 
-- 目的:
--   scenario_masters のタイトルが変更されたとき、
--   紐付いている schedule_events の scenario フィールドも自動更新
-- ============================================================

-- トリガー関数: シナリオマスターのタイトル変更を検知して schedule_events を更新
CREATE OR REPLACE FUNCTION sync_scenario_title_to_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- タイトルが変更された場合のみ処理
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    UPDATE schedule_events
    SET scenario = NEW.title,
        updated_at = NOW()
    WHERE scenario_master_id = NEW.id;
    
    RAISE NOTICE 'Updated schedule_events scenario title from "%" to "%" for master_id %', 
      OLD.title, NEW.title, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS trigger_sync_scenario_title ON scenario_masters;

-- トリガーを作成
CREATE TRIGGER trigger_sync_scenario_title
  AFTER UPDATE ON scenario_masters
  FOR EACH ROW
  EXECUTE FUNCTION sync_scenario_title_to_events();

COMMENT ON FUNCTION sync_scenario_title_to_events() IS 
  'scenario_masters.title の変更を schedule_events.scenario に自動反映するトリガー関数';

-- ============================================================
-- 既存データの修正: scenario_master_id が設定されているが
-- scenario が古い/空のレコードを修正
-- ============================================================
UPDATE schedule_events se
SET scenario = sm.title
FROM scenario_masters sm
WHERE se.scenario_master_id = sm.id
  AND (se.scenario IS DISTINCT FROM sm.title);
