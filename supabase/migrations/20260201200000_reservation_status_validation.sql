-- ============================================================================
-- 予約ステータス遷移の検証強化
-- ============================================================================
-- 問題: admin_update_reservation_fields で無効なステータス遷移が可能
-- 例: cancelled → confirmed, completed → pending
-- 
-- 修正:
-- 1. ステータスカラムにCHECK制約を追加
-- 2. 有効なステータス遷移を検証する関数を作成
-- 3. admin_update_reservation_fields に検証を追加
-- ============================================================================

-- ============================================================================
-- 1. ステータスのCHECK制約を追加（安全に既存データを考慮）
-- ============================================================================
DO $$
BEGIN
  -- 既存の制約があれば削除
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'reservations_status_check'
  ) THEN
    ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
  END IF;
END $$;

-- 有効なステータス値のみ許可
ALTER TABLE reservations 
ADD CONSTRAINT reservations_status_check 
CHECK (status IN (
  'pending',           -- 予約申込
  'confirmed',         -- 確定
  'completed',         -- 完了
  'cancelled',         -- キャンセル
  'no_show',           -- ノーショー
  'gm_confirmed',      -- GM確定（貸切用）
  'pending_gm',        -- GM確認待ち（貸切用）
  'pending_store'      -- 店舗確認待ち（貸切用）
));

-- ============================================================================
-- 2. ステータス遷移検証関数
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_reservation_status_transition(
  p_old_status TEXT,
  p_new_status TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 同じステータスへの遷移は常に許可
  IF p_old_status = p_new_status THEN
    RETURN TRUE;
  END IF;

  -- 無効な遷移パターン
  
  -- キャンセル済みからの復活は禁止（データ整合性のため）
  IF p_old_status = 'cancelled' THEN
    RETURN FALSE;
  END IF;
  
  -- 完了済みからの変更は限定的（キャンセル/ノーショーのみ）
  IF p_old_status = 'completed' THEN
    IF p_new_status IN ('cancelled', 'no_show') THEN
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
  END IF;
  
  -- ノーショーからの変更は禁止
  IF p_old_status = 'no_show' THEN
    RETURN FALSE;
  END IF;
  
  -- pending → confirmed, cancelled, pending_gm, gm_confirmed は許可
  IF p_old_status = 'pending' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_gm', 'gm_confirmed') THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  -- pending_gm → gm_confirmed, cancelled は許可
  IF p_old_status = 'pending_gm' THEN
    IF p_new_status IN ('gm_confirmed', 'cancelled') THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  -- pending_store → confirmed, cancelled は許可
  IF p_old_status = 'pending_store' THEN
    IF p_new_status IN ('confirmed', 'cancelled') THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  -- gm_confirmed → confirmed, cancelled, pending_store は許可
  IF p_old_status = 'gm_confirmed' THEN
    IF p_new_status IN ('confirmed', 'cancelled', 'pending_store') THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  -- confirmed → completed, cancelled, no_show は許可
  IF p_old_status = 'confirmed' THEN
    IF p_new_status IN ('completed', 'cancelled', 'no_show') THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  -- その他は禁止
  RETURN FALSE;
END;
$$;

-- ============================================================================
-- 3. admin_update_reservation_fields にステータス遷移検証を追加
-- ============================================================================
-- 既存の関数を削除（戻り値の型が異なる場合があるため）
DROP FUNCTION IF EXISTS public.admin_update_reservation_fields(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.admin_update_reservation_fields(
  p_reservation_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_current_status TEXT;
  v_new_status TEXT;
  v_result JSONB;
BEGIN
  -- 呼び出し元ユーザーの確認
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
  END IF;
  
  -- 管理者権限チェック
  SELECT role::TEXT INTO v_caller_role
  FROM users
  WHERE id = v_caller_id;
  
  IF v_caller_role NOT IN ('admin', 'staff', 'license_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '権限がありません');
  END IF;
  
  -- 予約の存在確認と現在のステータス取得
  SELECT status INTO v_current_status
  FROM reservations
  WHERE id = p_reservation_id;
  
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;
  
  -- ステータス変更がある場合は遷移を検証
  IF p_updates ? 'status' THEN
    v_new_status := p_updates->>'status';
    
    IF v_new_status IS NOT NULL AND v_new_status != '' THEN
      IF NOT validate_reservation_status_transition(v_current_status, v_new_status) THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('無効なステータス遷移です: %s → %s', v_current_status, v_new_status)
        );
      END IF;
    END IF;
  END IF;
  
  -- 更新を実行
  UPDATE reservations
  SET
    store_id = CASE
      WHEN p_updates ? 'store_id' THEN (p_updates->>'store_id')::UUID
      ELSE store_id
    END,
    display_customer_name = CASE
      WHEN p_updates ? 'display_customer_name' THEN p_updates->>'display_customer_name'
      ELSE display_customer_name
    END,
    status = CASE
      WHEN p_updates ? 'status' THEN NULLIF(p_updates->>'status', '')
      ELSE status
    END,
    payment_status = CASE
      WHEN p_updates ? 'payment_status' THEN p_updates->>'payment_status'
      ELSE payment_status
    END,
    gm_staff = CASE
      WHEN p_updates ? 'gm_staff' THEN p_updates->>'gm_staff'
      ELSE gm_staff
    END,
    assigned_staff = CASE
      WHEN p_updates ? 'assigned_staff' THEN ARRAY(SELECT jsonb_array_elements_text(p_updates->'assigned_staff'))
      ELSE assigned_staff
    END,
    participant_names = CASE
      WHEN p_updates ? 'participant_names' THEN ARRAY(SELECT jsonb_array_elements_text(p_updates->'participant_names'))
      ELSE participant_names
    END,
    scenario_id = CASE
      WHEN p_updates ? 'scenario_id' THEN (p_updates->>'scenario_id')::UUID
      ELSE scenario_id
    END,
    updated_at = NOW()
  WHERE id = p_reservation_id;
  
  -- 更新後のデータを取得
  SELECT jsonb_build_object(
    'success', true,
    'data', row_to_json(r.*)
  ) INTO v_result
  FROM reservations r
  WHERE r.id = p_reservation_id;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. トリガーによる追加検証（直接UPDATEへの対策）
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_reservation_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ステータスが変更された場合のみ検証
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT validate_reservation_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % → % is not allowed', OLD.status, NEW.status
        USING ERRCODE = 'P0200';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS trigger_check_status_transition ON reservations;

-- トリガーを作成
CREATE TRIGGER trigger_check_status_transition
  BEFORE UPDATE OF status ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION check_reservation_status_transition();

-- ============================================================================
-- 権限設定
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.validate_reservation_status_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_reservation_fields(UUID, JSONB) TO authenticated;
