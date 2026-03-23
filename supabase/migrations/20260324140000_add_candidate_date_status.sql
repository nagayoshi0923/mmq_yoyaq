-- 候補日にステータスカラムを追加（却下された候補日を識別するため）
ALTER TABLE private_group_candidate_dates 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'rejected'));

COMMENT ON COLUMN private_group_candidate_dates.status IS '候補日のステータス: active=有効, rejected=却下済み';
