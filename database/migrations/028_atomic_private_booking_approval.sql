-- =============================================================================
-- マイグレーション 028: 貸切予約承認のアトミック処理
-- =============================================================================
-- 
-- 作成日: 2026-01-30
-- 
-- 🚨 問題:
--   貸切予約の承認が複数のUPDATE/INSERTを非アトミックに実行しており、
--   途中失敗で「confirmed だが公演がない」等の不整合状態が発生する可能性
-- 
-- ✅ 対策:
--   approve_private_booking RPC 関数で全処理をアトミックに実行
-- 
-- =============================================================================

CREATE OR REPLACE FUNCTION approve_private_booking(
  p_reservation_id UUID,
  p_selected_date DATE,
  p_selected_start_time TIME,
  p_selected_end_time TIME,
  p_selected_store_id UUID,
  p_selected_gm_id UUID,
  p_scenario_title TEXT,
  p_customer_name TEXT
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_reservation_record RECORD;
  v_schedule_event_id UUID;
  v_org_id UUID;
  v_gm_name TEXT;
  v_store_name TEXT;
  v_caller_org_id UUID;
BEGIN
  -- 🔒 予約情報を取得（ロック）
  SELECT * INTO v_reservation_record
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN ('pending', 'gm_confirmed')  -- 承認前または GM確認済み
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_ALREADY_CONFIRMED' USING ERRCODE = 'P0018';
  END IF;
  
  v_org_id := v_reservation_record.organization_id;
  
  -- 🔒 権限確認（スタッフ/管理者のみ）
  v_caller_org_id := get_user_organization_id();
  
  IF NOT (
    is_org_admin() OR 
    (v_caller_org_id IS NOT NULL AND v_caller_org_id = v_org_id)
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;
  
  -- ✅ 同じ枠に既存公演がないかチェック（ロック）
  -- time_slot の判定: start_time から時間帯を決定
  DECLARE
    v_time_slot TEXT;
    v_start_hour INTEGER;
  BEGIN
    v_start_hour := EXTRACT(HOUR FROM p_selected_start_time);
    
    IF v_start_hour < 12 THEN
      v_time_slot := '朝';
    ELSIF v_start_hour < 17 THEN
      v_time_slot := '昼';
    ELSE
      v_time_slot := '夜';
    END IF;
    
    -- 同じ日・同じ店舗・同じ時間帯に既存公演がないか
    PERFORM 1
    FROM schedule_events
    WHERE date = p_selected_date
      AND store_id = p_selected_store_id
      AND time_slot = v_time_slot
      AND is_cancelled = false
      AND organization_id = v_org_id
    FOR UPDATE NOWAIT;
    
    IF FOUND THEN
      RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE = 'P0019';
    END IF;
  END;
  
  -- GM名と店舗名を取得
  SELECT name INTO v_gm_name
  FROM staff
  WHERE id = p_selected_gm_id
    AND organization_id = v_org_id;
  
  IF v_gm_name IS NULL THEN
    RAISE EXCEPTION 'GM_NOT_FOUND' USING ERRCODE = 'P0022';
  END IF;
  
  SELECT name INTO v_store_name
  FROM stores
  WHERE id = p_selected_store_id
    AND organization_id = v_org_id;
  
  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0023';
  END IF;
  
  -- ✅ スケジュール作成（アトミックに）
  INSERT INTO schedule_events (
    date,
    venue,
    scenario,
    start_time,
    end_time,
    start_at,
    end_at,
    store_id,
    gms,
    gm_roles,
    is_reservation_enabled,
    status,
    category,
    organization_id,
    reservation_id,
    reservation_name,
    is_reservation_name_overwritten,
    time_slot
  ) VALUES (
    p_selected_date,
    v_store_name,
    p_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    (p_selected_date + p_selected_start_time)::TIMESTAMPTZ,
    (p_selected_date + p_selected_end_time)::TIMESTAMPTZ,
    p_selected_store_id,
    ARRAY[v_gm_name],
    jsonb_build_object(v_gm_name, 'gm'),  -- デフォルトはGM役割
    FALSE,  -- 貸切は非公開
    'confirmed',
    'private',
    v_org_id,
    p_reservation_id,
    p_customer_name,
    FALSE,
    CASE 
      WHEN EXTRACT(HOUR FROM p_selected_start_time) < 12 THEN '朝'
      WHEN EXTRACT(HOUR FROM p_selected_start_time) < 17 THEN '昼'
      ELSE '夜'
    END
  ) RETURNING id INTO v_schedule_event_id;
  
  -- ✅ 予約を更新（アトミックに）
  UPDATE reservations
  SET 
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    updated_at = NOW()
  WHERE id = p_reservation_id;
  
  RETURN v_schedule_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_private_booking TO authenticated;

COMMENT ON FUNCTION approve_private_booking IS 
'貸切予約の承認処理をアトミックに実行。reservations更新とschedule_events作成を1トランザクションで保証。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 028 完了';
  RAISE NOTICE '  - approve_private_booking RPC 関数を追加';
  RAISE NOTICE '  - 貸切承認のアトミック性を保証';
  RAISE NOTICE '  - スロット重複チェックを追加';
END $$;

-- =============================================================================
-- ロールバックSQL
-- =============================================================================
/*
DROP FUNCTION IF EXISTS approve_private_booking(UUID, DATE, TIME, TIME, UUID, UUID, TEXT, TEXT);
*/
