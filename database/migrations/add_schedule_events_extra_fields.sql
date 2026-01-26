-- schedule_events に追加の状態フィールドを追加
-- 作成日: 2026-01-26
-- 概要: 予約者名の上書き状態・貸切リクエスト情報・GM役割・場所貸し料金を保存

ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS is_reservation_name_overwritten BOOLEAN DEFAULT FALSE;

ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS is_private_request BOOLEAN DEFAULT FALSE;

ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS reservation_id UUID;

ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS gm_roles JSONB DEFAULT '{}'::jsonb;

ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS venue_rental_fee INTEGER;

COMMENT ON COLUMN schedule_events.is_reservation_name_overwritten IS '予約者名が手動で上書きされたかどうか';
COMMENT ON COLUMN schedule_events.is_private_request IS '貸切リクエスト由来の公演かどうか';
COMMENT ON COLUMN schedule_events.reservation_id IS '貸切リクエストの元reservation ID';
COMMENT ON COLUMN schedule_events.gm_roles IS 'GM役割情報（JSON）';
COMMENT ON COLUMN schedule_events.venue_rental_fee IS '場所貸し公演料金';

