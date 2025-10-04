-- 予約システムとスケジュール管理システムの統合
-- Phase 1: カラム追加

-- 1. customersテーブルにemailカラムを追加
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- emailのインデックスを追加（検索高速化）
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 2. reservationsテーブルにschedule_event_idを追加
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS schedule_event_id UUID REFERENCES schedule_events(id) ON DELETE RESTRICT;

-- schedule_event_idのインデックスを追加
CREATE INDEX IF NOT EXISTS idx_reservations_schedule_event_id ON reservations(schedule_event_id);

-- 3. schedule_eventsテーブルに予約関連情報を追加
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS max_participants INTEGER;
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS reservation_deadline_hours INTEGER DEFAULT 24; -- 予約締め切り時間（公演開始の何時間前まで）
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS is_reservation_enabled BOOLEAN DEFAULT true; -- 予約受付可能フラグ
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS reservation_notes TEXT; -- 予約時の注意事項

-- 4. 便利なビューを作成：予約状況サマリー
CREATE OR REPLACE VIEW reservation_summary AS
SELECT 
  se.id as schedule_event_id,
  se.date,
  se.venue,
  se.scenario,
  se.start_time,
  se.end_time,
  se.max_participants,
  COALESCE(SUM(CASE WHEN r.status IN ('pending', 'confirmed') THEN r.participant_count ELSE 0 END), 0) as current_reservations,
  COALESCE(se.max_participants - SUM(CASE WHEN r.status IN ('pending', 'confirmed') THEN r.participant_count ELSE 0 END), se.max_participants) as available_seats,
  COUNT(CASE WHEN r.status IN ('pending', 'confirmed') THEN 1 END) as reservation_count
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id
GROUP BY se.id, se.date, se.venue, se.scenario, se.start_time, se.end_time, se.max_participants;

-- 5. 顧客の予約履歴を簡単に取得できるビュー
CREATE OR REPLACE VIEW customer_reservation_history AS
SELECT 
  c.id as customer_id,
  c.name as customer_name,
  c.email,
  c.phone,
  r.id as reservation_id,
  r.reservation_number,
  r.status as reservation_status,
  r.requested_datetime,
  r.participant_count,
  r.final_price,
  se.scenario,
  se.venue,
  s.name as store_name
FROM customers c
LEFT JOIN reservations r ON r.customer_id = c.id
LEFT JOIN schedule_events se ON r.schedule_event_id = se.id
LEFT JOIN stores s ON se.venue::uuid = s.id
ORDER BY r.requested_datetime DESC;

-- 6. コメント追加（ドキュメント代わり）
COMMENT ON COLUMN customers.email IS '顧客のメールアドレス（予約確認メール送信用）';
COMMENT ON COLUMN customers.email_verified IS 'メールアドレスが確認済みかどうか';
COMMENT ON COLUMN reservations.schedule_event_id IS 'スケジュール管理システムの公演IDとの紐付け';
COMMENT ON COLUMN schedule_events.max_participants IS '最大参加可能人数';
COMMENT ON COLUMN schedule_events.reservation_deadline_hours IS '予約締め切り時間（公演開始の何時間前）';
COMMENT ON COLUMN schedule_events.is_reservation_enabled IS '予約受付可能フラグ（false=予約受付停止）';
COMMENT ON COLUMN schedule_events.reservation_notes IS '予約時の注意事項（顧客に表示）';

