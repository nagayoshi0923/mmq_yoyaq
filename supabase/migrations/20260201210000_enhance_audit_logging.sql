-- ============================================================================
-- 監査ログの強化
-- ============================================================================
-- 問題: 以下の重要操作が監査ログに記録されていない
-- - スタッフ招待の承諾
-- - 管理者RPC操作（一括削除、価格再計算）
-- - 設定変更
--
-- 修正:
-- 1. admin RPC関数に明示的なログ記録を追加
-- 2. スタッフ操作のトリガーを追加
-- 3. 設定変更のトリガーを追加
-- ============================================================================

-- ============================================================================
-- 1. 管理者一括削除操作のログ記録
-- ============================================================================
-- 既存の関数を削除（戻り値の型が異なる場合があるため）
DROP FUNCTION IF EXISTS public.admin_delete_reservations_by_ids(UUID[]);

CREATE OR REPLACE FUNCTION public.admin_delete_reservations_by_ids(
  p_reservation_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_deleted_count INTEGER;
  v_reservation_numbers TEXT[];
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
  
  IF v_caller_role NOT IN ('admin', 'license_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '管理者権限が必要です');
  END IF;
  
  -- 削除対象の予約番号を取得（ログ用）
  SELECT ARRAY_AGG(reservation_number) INTO v_reservation_numbers
  FROM reservations
  WHERE id = ANY(p_reservation_ids);
  
  -- 監査ログを記録
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    ip_address
  )
  SELECT 
    v_caller_id,
    'BULK_DELETE',
    'reservations',
    id,
    row_to_json(r.*)::JSONB,
    NULL,
    NULL
  FROM reservations r
  WHERE r.id = ANY(p_reservation_ids);
  
  -- 削除を実行
  DELETE FROM reservations
  WHERE id = ANY(p_reservation_ids);
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'deleted_reservation_numbers', v_reservation_numbers
  );
END;
$$;

-- ============================================================================
-- 2. 価格再計算操作のログ記録
-- ============================================================================
-- 既存の関数を削除（戻り値の型が異なる場合があるため）
DROP FUNCTION IF EXISTS public.admin_recalculate_reservation_prices(UUID);

CREATE OR REPLACE FUNCTION public.admin_recalculate_reservation_prices(
  p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_old_values JSONB;
  v_reservation RECORD;
  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_final_price INTEGER;
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
  
  -- 現在の値を取得（監査ログ用）
  SELECT * INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id;
  
  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;
  
  v_old_values := jsonb_build_object(
    'unit_price', v_reservation.unit_price,
    'total_price', v_reservation.total_price,
    'base_price', v_reservation.base_price,
    'final_price', v_reservation.final_price,
    'participant_count', v_reservation.participant_count
  );
  
  -- 単価を計算
  v_unit_price := COALESCE(
    v_reservation.unit_price,
    CASE 
      WHEN v_reservation.participant_count > 0 
      THEN ROUND(v_reservation.base_price::NUMERIC / v_reservation.participant_count)
      ELSE 0
    END
  );
  
  -- 合計を再計算
  v_total_price := v_unit_price * v_reservation.participant_count;
  v_final_price := v_total_price - COALESCE(v_reservation.discount_amount, 0);
  
  -- 更新を実行
  UPDATE reservations
  SET 
    unit_price = v_unit_price,
    total_price = v_total_price,
    base_price = v_total_price,
    final_price = v_final_price,
    updated_at = NOW()
  WHERE id = p_reservation_id;
  
  -- 監査ログを記録
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    ip_address
  ) VALUES (
    v_caller_id,
    'PRICE_RECALCULATE',
    'reservations',
    p_reservation_id,
    v_old_values,
    jsonb_build_object(
      'unit_price', v_unit_price,
      'total_price', v_total_price,
      'base_price', v_total_price,
      'final_price', v_final_price,
      'participant_count', v_reservation.participant_count
    ),
    NULL
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'unit_price', v_unit_price,
      'total_price', v_total_price,
      'final_price', v_final_price
    )
  );
END;
$$;

-- ============================================================================
-- 3. スタッフ操作の監査トリガー
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_staff_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
    VALUES (v_user_id, v_action, 'staff', NEW.id, row_to_json(NEW)::JSONB);
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    -- 重要なフィールドの変更のみ記録
    IF OLD.role IS DISTINCT FROM NEW.role 
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.email IS DISTINCT FROM NEW.email
       OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
      VALUES (
        v_user_id, 
        v_action, 
        'staff', 
        NEW.id,
        jsonb_build_object(
          'role', OLD.role,
          'status', OLD.status,
          'email', OLD.email,
          'user_id', OLD.user_id
        ),
        jsonb_build_object(
          'role', NEW.role,
          'status', NEW.status,
          'email', NEW.email,
          'user_id', NEW.user_id
        )
      );
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values)
    VALUES (v_user_id, v_action, 'staff', OLD.id, row_to_json(OLD)::JSONB);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS trigger_audit_staff ON staff;

-- スタッフ監査トリガーを作成
CREATE TRIGGER trigger_audit_staff
  AFTER INSERT OR UPDATE OR DELETE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION audit_staff_changes();

-- ============================================================================
-- 4. 組織設定変更の監査トリガー
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_organization_settings_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
      v_user_id,
      'SETTINGS_UPDATE',
      TG_TABLE_NAME,
      COALESCE(NEW.id, NEW.organization_id),
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 組織設定テーブルが存在する場合にトリガーを追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_settings') THEN
    DROP TRIGGER IF EXISTS trigger_audit_org_settings ON organization_settings;
    CREATE TRIGGER trigger_audit_org_settings
      AFTER UPDATE ON organization_settings
      FOR EACH ROW
      EXECUTE FUNCTION audit_organization_settings_changes();
  END IF;
END $$;

-- グローバル設定テーブルが存在する場合にトリガーを追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
    DROP TRIGGER IF EXISTS trigger_audit_global_settings ON global_settings;
    CREATE TRIGGER trigger_audit_global_settings
      AFTER UPDATE ON global_settings
      FOR EACH ROW
      EXECUTE FUNCTION audit_organization_settings_changes();
  END IF;
END $$;

-- ============================================================================
-- 5. 招待承諾の監査トリガー
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_invitation_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- accepted_at が設定された（承諾された）場合のみ記録
  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    v_user_id := auth.uid();
    
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
    VALUES (
      v_user_id,
      'INVITATION_ACCEPTED',
      'organization_invitations',
      NEW.id,
      jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'organization_id', NEW.organization_id,
        'accepted_at', NEW.accepted_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 招待テーブルが存在する場合にトリガーを追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_invitations') THEN
    DROP TRIGGER IF EXISTS trigger_audit_invitation_acceptance ON organization_invitations;
    CREATE TRIGGER trigger_audit_invitation_acceptance
      AFTER UPDATE ON organization_invitations
      FOR EACH ROW
      EXECUTE FUNCTION audit_invitation_acceptance();
  END IF;
END $$;

-- ============================================================================
-- 権限設定
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_ids(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_reservation_prices(UUID) TO authenticated;
