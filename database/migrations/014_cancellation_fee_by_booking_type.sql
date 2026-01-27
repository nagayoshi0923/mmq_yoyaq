-- =============================================================================
-- マイグレーション 014: 予約タイプ別キャンセル料設定
-- =============================================================================
-- 
-- 作成日: 2026-01-28
-- 
-- 目的:
--   貸切予約と通常公演で異なるキャンセルポリシーを設定可能にする
--   サーバー側でキャンセル料を計算（クライアント改ざん防止）
-- 
-- =============================================================================

-- 1. reservation_settings テーブルに貸切予約用のキャンセル設定を追加
ALTER TABLE reservation_settings 
ADD COLUMN IF NOT EXISTS private_booking_cancellation_fees JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN reservation_settings.private_booking_cancellation_fees IS 
'貸切予約用のキャンセル料設定。cancellation_fees と同じ構造。';

-- 2. キャンセル料計算関数を作成
CREATE OR REPLACE FUNCTION calculate_cancellation_fee(
  p_reservation_id UUID
)
RETURNS TABLE(
  fee_amount INTEGER,
  fee_percentage INTEGER,
  hours_until_event NUMERIC,
  is_private_booking BOOLEAN,
  policy_description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
  v_event RECORD;
  v_settings RECORD;
  v_cancellation_fees JSONB;
  v_hours_until NUMERIC;
  v_fee_percentage INTEGER := 0;
  v_fee_amount INTEGER := 0;
  v_description TEXT := '';
  v_fee RECORD;
BEGIN
  -- 予約情報を取得
  SELECT r.*, r.is_private_booking as is_private
  INTO v_reservation
  FROM reservations r
  WHERE r.id = p_reservation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION '予約が見つかりません: %', p_reservation_id;
  END IF;
  
  -- イベント情報を取得
  SELECT se.*
  INTO v_event
  FROM schedule_events se
  WHERE se.id = v_reservation.schedule_event_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'イベントが見つかりません';
  END IF;
  
  -- 公演開始までの時間を計算
  v_hours_until := EXTRACT(EPOCH FROM (
    (v_event.date + v_event.start_time::time) - NOW()
  )) / 3600;
  
  -- 店舗設定を取得
  SELECT rs.*
  INTO v_settings
  FROM reservation_settings rs
  WHERE rs.store_id = v_event.store_id;
  
  -- 予約タイプに応じたキャンセル料設定を選択
  IF v_reservation.is_private THEN
    -- 貸切予約用の設定を使用（なければ通常設定を使用）
    v_cancellation_fees := COALESCE(
      NULLIF(v_settings.private_booking_cancellation_fees, '[]'::JSONB),
      v_settings.cancellation_fees,
      '[{"hours_before": 168, "fee_percentage": 50}, {"hours_before": 72, "fee_percentage": 100}]'::JSONB
    );
  ELSE
    -- 通常公演用の設定
    v_cancellation_fees := COALESCE(
      v_settings.cancellation_fees,
      '[{"hours_before": 24, "fee_percentage": 50}, {"hours_before": 0, "fee_percentage": 100}]'::JSONB
    );
  END IF;
  
  -- 該当するキャンセル料率を検索（hours_before が大きい順にチェック）
  FOR v_fee IN
    SELECT * FROM jsonb_to_recordset(v_cancellation_fees) 
    AS x(hours_before INTEGER, fee_percentage INTEGER, description TEXT)
    ORDER BY hours_before DESC
  LOOP
    IF v_hours_until <= v_fee.hours_before THEN
      v_fee_percentage := v_fee.fee_percentage;
      v_description := COALESCE(v_fee.description, v_fee_percentage || '%');
    END IF;
  END LOOP;
  
  -- キャンセル料金額を計算
  v_fee_amount := ROUND((COALESCE(v_reservation.total_price, 0) * v_fee_percentage) / 100);
  
  RETURN QUERY SELECT 
    v_fee_amount,
    v_fee_percentage,
    v_hours_until,
    v_reservation.is_private,
    v_description;
END;
$$;

COMMENT ON FUNCTION calculate_cancellation_fee(UUID) IS 
'予約IDからキャンセル料を計算。予約タイプ（貸切/通常）に応じた設定を使用。';

GRANT EXECUTE ON FUNCTION calculate_cancellation_fee(UUID) TO authenticated;

-- 3. Queens Waltz の初期設定（organization_id が必要）
-- 注: 実際の設定は設定画面から行うか、以下のSQLで直接設定

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 014 完了: 予約タイプ別キャンセル料設定を追加';
END $$;

-- =============================================================================
-- ロールバックSQL（必要な場合のみ実行）
-- =============================================================================
/*
ALTER TABLE reservation_settings DROP COLUMN IF EXISTS private_booking_cancellation_fees;
DROP FUNCTION IF EXISTS calculate_cancellation_fee(UUID);
*/

