-- 場所貸しの公演料金カラムを追加
-- デフォルト値は12,000円

ALTER TABLE schedule_events 
ADD COLUMN IF NOT EXISTS venue_rental_fee INTEGER DEFAULT 12000;

-- コメント追加
COMMENT ON COLUMN schedule_events.venue_rental_fee IS '場所貸しの公演料金（円）。デフォルト12,000円';






