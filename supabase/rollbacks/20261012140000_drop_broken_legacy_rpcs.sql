-- 20261012140000 の取り消し: 消した 2 つの関数を、消す前と同じ中身・権限で作り直す。
BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_cancellation_fee(p_reservation_id uuid)
 RETURNS TABLE(fee_amount integer, fee_percentage integer, hours_until_event numeric, is_private_booking boolean, policy_description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'Asia/Tokyo'
AS $function$
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
$function$

;

COMMENT ON FUNCTION public.calculate_cancellation_fee(uuid) IS '予約IDからキャンセル料を計算（マルチテナント: 顧客本人/自組織スタッフ/管理者のみ）。JST明示で時間計算。';
REVOKE EXECUTE ON FUNCTION public.calculate_cancellation_fee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_cancellation_fee(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_recalculate_reservation_prices(p_reservation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_org_id UUID;
  v_old_values JSONB;
  v_reservation RECORD;
  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_final_price INTEGER;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
  END IF;
  
  SELECT role::TEXT INTO v_caller_role
  FROM users
  WHERE id = v_caller_id;
  
  IF v_caller_role NOT IN ('admin', 'staff', 'license_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '権限がありません');
  END IF;

  -- ★ P0-D 修正: 組織境界チェック
  v_caller_org_id := get_user_organization_id();
  
  SELECT * INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id;
  
  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  IF v_reservation.organization_id IS DISTINCT FROM v_caller_org_id THEN
    RETURN jsonb_build_object('success', false, 'error', '他の組織の予約は操作できません');
  END IF;
  
  v_old_values := jsonb_build_object(
    'unit_price', v_reservation.unit_price,
    'total_price', v_reservation.total_price,
    'base_price', v_reservation.base_price,
    'final_price', v_reservation.final_price,
    'participant_count', v_reservation.participant_count
  );
  
  v_unit_price := COALESCE(
    v_reservation.unit_price,
    CASE 
      WHEN v_reservation.participant_count > 0 
      THEN ROUND(v_reservation.base_price::NUMERIC / v_reservation.participant_count)
      ELSE 0
    END
  );
  
  v_total_price := v_unit_price * v_reservation.participant_count;
  v_final_price := v_total_price - COALESCE(v_reservation.discount_amount, 0);
  
  UPDATE reservations
  SET 
    unit_price = v_unit_price,
    total_price = v_total_price,
    base_price = v_total_price,
    final_price = v_final_price,
    updated_at = NOW()
  WHERE id = p_reservation_id
    AND organization_id = v_caller_org_id;
  
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    organization_id
  ) VALUES (
    v_caller_id,
    'reservations.recalculate_prices',
    'reservations',
    p_reservation_id,
    v_old_values,
    jsonb_build_object(
      'unit_price', v_unit_price,
      'total_price', v_total_price,
      'base_price', v_total_price,
      'final_price', v_final_price
    ),
    v_caller_org_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'old', v_old_values,
    'new', jsonb_build_object(
      'unit_price', v_unit_price,
      'total_price', v_total_price,
      'final_price', v_final_price
    )
  );
END;
$function$

;

REVOKE EXECUTE ON FUNCTION public.admin_recalculate_reservation_prices(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_reservation_prices(uuid) TO service_role;

COMMIT;
