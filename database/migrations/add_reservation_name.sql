-- schedule_eventsテーブルにreservation_nameカラムを追加
-- 貸切予約の予約者名を保存するためのカラム

-- カラム追加
ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS reservation_name TEXT;

-- コメント追加
COMMENT ON COLUMN schedule_events.reservation_name IS '貸切予約の予約者名。MMQ予約の場合は顧客名を、手動入力の場合は編集した値を保存';




