-- schedule_event_history テーブルに不足カラムを追加
-- セル情報（日付・店舗・時間帯）を追加して、削除後も履歴を関連付けられるようにする

-- 1. 不足しているカラムを追加
ALTER TABLE schedule_event_history 
ADD COLUMN IF NOT EXISTS event_date DATE;

ALTER TABLE schedule_event_history 
ADD COLUMN IF NOT EXISTS store_id UUID;

ALTER TABLE schedule_event_history 
ADD COLUMN IF NOT EXISTS time_slot TEXT;

ALTER TABLE schedule_event_history 
ADD COLUMN IF NOT EXISTS deleted_event_scenario TEXT;

-- 2. store_id に外部キー制約を追加（既存データがある場合を考慮してNULL許可）
-- 注意: 既存レコードがある場合、store_id は NULL になります

-- 3. インデックス作成（存在しない場合のみ）
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_event_id 
ON schedule_event_history(schedule_event_id);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_org_id 
ON schedule_event_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_created_at 
ON schedule_event_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_changed_by 
ON schedule_event_history(changed_by_user_id);

-- セル情報でのフィルタリング用インデックス（削除後の履歴検索用）
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_cell 
ON schedule_event_history(organization_id, event_date, store_id, time_slot);

-- 4. コメント追加
COMMENT ON COLUMN schedule_event_history.event_date IS '公演日（セル特定用）';
COMMENT ON COLUMN schedule_event_history.store_id IS '店舗ID（セル特定用）';
COMMENT ON COLUMN schedule_event_history.time_slot IS '時間帯（朝/昼/夜）（セル特定用）';
COMMENT ON COLUMN schedule_event_history.deleted_event_scenario IS '削除された公演のシナリオ名';
