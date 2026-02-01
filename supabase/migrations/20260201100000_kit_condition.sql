-- キットの状態管理カラムを追加
-- 欠けあり、修理中などの状態をメモできるようにする

-- scenario_kit_locations に状態カラムを追加
ALTER TABLE scenario_kit_locations 
ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'good' 
  CHECK (condition IN ('good', 'damaged', 'repairing', 'missing_parts', 'retired'));

ALTER TABLE scenario_kit_locations 
ADD COLUMN IF NOT EXISTS condition_notes TEXT;

-- コメント
COMMENT ON COLUMN scenario_kit_locations.condition IS 'キットの状態: good=良好, damaged=破損, repairing=修理中, missing_parts=欠けあり, retired=引退';
COMMENT ON COLUMN scenario_kit_locations.condition_notes IS '状態に関するメモ（何が欠けているか等）';
