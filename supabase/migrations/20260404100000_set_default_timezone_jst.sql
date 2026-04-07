-- =============================================================================
-- マイグレーション: DBデフォルトタイムゾーンをJST(Asia/Tokyo)に設定
-- =============================================================================
--
-- 目的:
--   このシステムは日本国内専用サービスのため、DBセッションのデフォルトtimezoneを
--   UTC から Asia/Tokyo に変更する。
--
-- 効果:
--   - CURRENT_DATE がJST基準の日付を返す（深夜0〜9時のズレが解消）
--   - 今後 CURRENT_DATE を使うコードがJST基準で自然に動く
--   - timestamp（TZなし）カラムがJSTとして解釈される（現状使用なし）
--
-- 影響なしの確認:
--   - timestamptz カラム: 内部UTC保存は変わらない（影響なし）
--   - pg_cron スケジュール: UTC固定で動く（影響なし）
--   - Edge Function: Denoランタイムは独立（影響なし）
--
-- あわせて修正:
--   - calculate_cancellation_fee() の date+time 比較をJST明示に修正
-- =============================================================================

-- 1. データベースのデフォルトtimezoneをJSTに設定
ALTER DATABASE postgres SET timezone TO 'Asia/Tokyo';

DO $$
BEGIN
  RAISE NOTICE '✅ データベースのデフォルトtimezoneをAsia/Tokyoに設定しました';
  RAISE NOTICE '   ※ 既存セッションには影響しません。再接続後に有効になります。';
END $$;

-- 2. calculate_cancellation_fee の時間計算をJST明示に修正
--    旧: (date + time::time) - NOW()  ← date+time が timezone なし timestamp になりUTC扱い
--    新: (date::text || ' ' || time::text || '+09:00')::timestamptz - NOW()  ← JST として比較
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
SET timezone = 'Asia/Tokyo'
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
  v_uid UUID;
  v_is_org_staff BOOLEAN := false;
  v_is_customer BOOLEAN := false;
BEGIN
  v_uid := auth.uid();

  -- 予約情報を取得
  SELECT r.*, r.is_private_booking as is_private
  INTO v_reservation
  FROM reservations r
  WHERE r.id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '予約が見つかりません: %', p_reservation_id;
  END IF;

  -- 権限チェック（クロステナント防止）
  IF is_org_admin() THEN
    NULL;
  ELSE
    -- 1) 顧客本人か？
    IF v_uid IS NOT NULL AND v_reservation.customer_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1
        FROM customers c
        WHERE c.id = v_reservation.customer_id
          AND c.user_id = v_uid
      )
      INTO v_is_customer;
    END IF;

    -- 2) 自組織スタッフか？
    IF v_uid IS NOT NULL AND v_reservation.organization_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1
        FROM staff s
        WHERE s.user_id = v_uid
          AND s.status = 'active'
          AND s.organization_id = v_reservation.organization_id
      )
      INTO v_is_org_staff;
    END IF;

    IF NOT (v_is_customer OR v_is_org_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  -- イベント情報を取得
  SELECT se.*
  INTO v_event
  FROM schedule_events se
  WHERE se.id = v_reservation.schedule_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'イベントが見つかりません';
  END IF;

  -- 公演開始までの時間を計算（JST明示: date + time を +09:00 として解釈）
  v_hours_until := EXTRACT(EPOCH FROM (
    (v_event.date::text || ' ' || v_event.start_time::text || '+09:00')::timestamptz - NOW()
  )) / 3600;

  -- 店舗設定を取得
  SELECT rs.*
  INTO v_settings
  FROM reservation_settings rs
  WHERE rs.store_id = v_event.store_id;

  -- 予約タイプに応じたキャンセル料設定を選択
  IF v_reservation.is_private THEN
    v_cancellation_fees := COALESCE(
      NULLIF(v_settings.private_booking_cancellation_fees, '[]'::JSONB),
      v_settings.cancellation_fees,
      '[{"hours_before": 168, "fee_percentage": 50}, {"hours_before": 72, "fee_percentage": 100}]'::JSONB
    );
  ELSE
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

GRANT EXECUTE ON FUNCTION calculate_cancellation_fee(UUID) TO authenticated;

COMMENT ON FUNCTION calculate_cancellation_fee(UUID) IS
'予約IDからキャンセル料を計算（マルチテナント: 顧客本人/自組織スタッフ/管理者のみ）。JST明示で時間計算。';

DO $$
BEGIN
  RAISE NOTICE '✅ calculate_cancellation_fee のJST修正完了';
  RAISE NOTICE '   旧: date + time::time - NOW() (9時間ズレあり)';
  RAISE NOTICE '   新: (date || time || +09:00)::timestamptz - NOW() (JST明示)';
END $$;
