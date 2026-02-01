-- =============================================================================
-- マイグレーション 032: 予約ステータス遷移のバリデーション
-- =============================================================================
-- 
-- 作成日: 2026-02-01
-- 
-- 問題:
--   admin_update_reservation_fields で任意のステータスに変更可能だった
--   例: cancelled → confirmed への不正な遷移が可能
-- 
-- 修正:
--   状態遷移マトリクスを定義し、不正な遷移を防止
-- 
-- =============================================================================

-- 状態遷移の検証関数
CREATE OR REPLACE FUNCTION validate_reservation_status_transition(
  p_current_status TEXT,
  p_new_status TEXT,
  p_is_admin BOOLEAN DEFAULT FALSE
) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  -- 同じステータスへの遷移は常に許可
  IF p_current_status = p_new_status THEN
    RETURN TRUE;
  END IF;

  -- 状態遷移マトリクス
  -- 許可される遷移のみを定義
  CASE p_current_status
    WHEN 'pending' THEN
      -- pending → confirmed, gm_confirmed, cancelled
      IF p_new_status IN ('confirmed', 'gm_confirmed', 'cancelled') THEN
        RETURN TRUE;
      END IF;
    
    WHEN 'gm_confirmed' THEN
      -- gm_confirmed → confirmed, cancelled
      IF p_new_status IN ('confirmed', 'cancelled') THEN
        RETURN TRUE;
      END IF;
    
    WHEN 'confirmed' THEN
      -- confirmed → completed, cancelled, no_show
      IF p_new_status IN ('completed', 'cancelled', 'no_show') THEN
        RETURN TRUE;
      END IF;
    
    WHEN 'completed' THEN
      -- completed は基本的に変更不可（管理者のみno_showへの変更を許可）
      IF p_is_admin AND p_new_status = 'no_show' THEN
        RETURN TRUE;
      END IF;
    
    WHEN 'cancelled' THEN
      -- cancelled は基本的に変更不可（管理者のみ復元を許可）
      IF p_is_admin AND p_new_status IN ('pending', 'confirmed') THEN
        RETURN TRUE;
      END IF;
    
    WHEN 'no_show' THEN
      -- no_show は基本的に変更不可（管理者のみ変更を許可）
      IF p_is_admin AND p_new_status IN ('completed', 'cancelled') THEN
        RETURN TRUE;
      END IF;
    
    ELSE
      -- 未知のステータスの場合は許可しない
      RETURN FALSE;
  END CASE;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION validate_reservation_status_transition IS 
'予約ステータスの遷移が有効かどうかを検証。管理者は一部の例外的な遷移も許可。';

-- admin_update_reservation_fields を更新して状態遷移検証を追加
CREATE OR REPLACE FUNCTION public.admin_update_reservation_fields(
  p_reservation_id UUID,
  p_updates JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_rows INTEGER;
  v_scenario_id UUID;
  v_current_status TEXT;
  v_new_status TEXT;
BEGIN
  IF p_updates IS NULL THEN
    RAISE EXCEPTION 'INVALID_UPDATES' USING ERRCODE = 'P0101';
  END IF;

  SELECT organization_id, status
  INTO v_reservation_org_id, v_current_status
  FROM reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0100';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id IS DISTINCT FROM v_reservation_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  -- 🔒 ステータス変更時の遷移バリデーション
  IF p_updates ? 'status' THEN
    v_new_status := NULLIF(p_updates->>'status', '');
    IF v_new_status IS NOT NULL AND NOT validate_reservation_status_transition(v_current_status, v_new_status, v_is_admin) THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % → % is not allowed', v_current_status, v_new_status
        USING ERRCODE = 'P0102';
    END IF;
  END IF;

  IF p_updates ? 'scenario_id' THEN
    IF (p_updates->'scenario_id') = 'null'::jsonb THEN
      v_scenario_id := NULL;
    ELSE
      v_scenario_id := NULLIF(p_updates->>'scenario_id', '')::uuid;
    END IF;
  END IF;

  UPDATE reservations
  SET
    store_id = CASE
      WHEN p_updates ? 'store_id' THEN NULLIF(p_updates->>'store_id', '')::uuid
      ELSE store_id
    END,
    display_customer_name = CASE
      WHEN p_updates ? 'display_customer_name' THEN NULLIF(p_updates->>'display_customer_name', '')
      ELSE display_customer_name
    END,
    status = CASE
      WHEN p_updates ? 'status' THEN NULLIF(p_updates->>'status', '')
      ELSE status
    END,
    -- キャンセル時は cancelled_at を設定
    cancelled_at = CASE
      WHEN p_updates ? 'status' AND NULLIF(p_updates->>'status', '') = 'cancelled' AND status != 'cancelled'
        THEN NOW()
      ELSE cancelled_at
    END,
    payment_status = CASE
      WHEN p_updates ? 'payment_status' THEN NULLIF(p_updates->>'payment_status', '')
      ELSE payment_status
    END,
    gm_staff = CASE
      WHEN p_updates ? 'gm_staff' THEN NULLIF(p_updates->>'gm_staff', '')
      ELSE gm_staff
    END,
    assigned_staff = CASE
      WHEN p_updates ? 'assigned_staff' THEN (
        SELECT COALESCE(array_agg(v), ARRAY[]::text[])
        FROM jsonb_array_elements_text(p_updates->'assigned_staff') AS t(v)
      )
      ELSE assigned_staff
    END,
    participant_names = CASE
      WHEN p_updates ? 'participant_names' THEN (
        SELECT COALESCE(array_agg(v), ARRAY[]::text[])
        FROM jsonb_array_elements_text(p_updates->'participant_names') AS t(v)
      )
      ELSE participant_names
    END,
    scenario_id = CASE
      WHEN p_updates ? 'scenario_id' THEN v_scenario_id
      ELSE scenario_id
    END,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_reservation_fields(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_reservation_status_transition TO authenticated;

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 032 完了: 予約ステータス遷移のバリデーションを追加';
END $$;
