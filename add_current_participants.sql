-- schedule_eventsテーブルにcurrent_participantsカラムを追加
ALTER TABLE schedule_events 
ADD COLUMN IF NOT EXISTS current_participants INTEGER DEFAULT 0;

-- 既存のデータに対して、予約から参加者数を集計して設定
UPDATE schedule_events se
SET current_participants = COALESCE((
  SELECT SUM(r.participant_count)
  FROM reservations r
  WHERE r.event_id = se.id
    AND r.status IN ('confirmed', 'pending')
), 0);

