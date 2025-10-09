-- reservationsテーブルに優先度カラムを追加

-- 優先度カラム（0=通常、数値が高いほど優先）
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- 候補日時をJSONBで保存するカラム
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS candidate_datetimes JSONB;

-- コメント追加
COMMENT ON COLUMN reservations.priority IS '優先度（0=通常、数値が高いほど優先）VIP対応や特別な事情がある場合に使用';
COMMENT ON COLUMN reservations.candidate_datetimes IS '貸切リクエストの候補日時リスト（JSONB形式）';
