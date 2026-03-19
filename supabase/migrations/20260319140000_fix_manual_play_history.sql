-- manual_play_history テーブルの修正
-- 1. scenario_master_id カラム追加（まだない場合）
-- 2. played_at を NULL 許容に変更

ALTER TABLE manual_play_history 
ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

ALTER TABLE manual_play_history 
ALTER COLUMN played_at DROP NOT NULL;

COMMENT ON COLUMN manual_play_history.scenario_master_id IS 'シナリオマスターID（scenario_mastersへの参照）';
COMMENT ON COLUMN manual_play_history.played_at IS 'プレイした日付（任意）';
