-- =============================================================================
-- マイグレーション 029: calculate_cancellation_fee の権限チェック強化（マルチテナント）
-- =============================================================================
--
-- 目的:
-- - SECURITY DEFINER で authenticated に公開されている calculate_cancellation_fee が、
--   予約IDを知っていれば他組織の情報を参照できる状態を防ぐ。
--
-- 方針:
-- - 呼び出し元が次のいずれかの場合のみ許可
--   1) 自分がその予約の顧客（customers.user_id = auth.uid()）
--   2) 自組織のスタッフ（staff.user_id = auth.uid() かつ organization_id 一致）
--   3) is_org_admin()（運用要件により全組織アクセスを許可する場合）
--
-- NOTE:
-- - 本関数はキャンセル画面等で顧客からも呼ばれる想定のため、
--   get_user_organization_id() だけで判定すると顧客が弾かれる可能性がある。
--
-- =============================================================================

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

  -- -----------------------------------------------------------------------------
  -- 🔒 権限チェック（クロステナント防止）
  -- -----------------------------------------------------------------------------
  IF is_org_admin() THEN
    -- OK（運用要件により全組織アクセスを許可）
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

GRANT EXECUTE ON FUNCTION calculate_cancellation_fee(UUID) TO authenticated;

COMMENT ON FUNCTION calculate_cancellation_fee(UUID) IS
'予約IDからキャンセル料を計算（マルチテナント: 顧客本人/自組織スタッフ/管理者のみ）。';

