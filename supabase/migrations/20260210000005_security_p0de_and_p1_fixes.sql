-- =============================================================================
-- P0-D: admin_delete_reservations_by_ids に組織境界チェック追加
-- P0-E: reservations_history SELECT ポリシーを組織スコープに修正
-- P1-18: SECURITY DEFINER 関数に SET search_path 追加
-- P1-21: auth_logs INSERT ポリシーを service_role のみに制限
-- =============================================================================

-- =============================================================================
-- P0-D: admin_delete_reservations_by_ids — 他組織の予約を削除できてしまう
-- =============================================================================
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
  v_caller_org_id UUID;
  v_deleted_count INTEGER;
  v_reservation_numbers TEXT[];
  v_cross_org_count INTEGER;
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

  -- ★ P0-D 修正: 組織境界チェック
  v_caller_org_id := get_user_organization_id();

  SELECT COUNT(*) INTO v_cross_org_count
  FROM reservations
  WHERE id = ANY(p_reservation_ids)
    AND organization_id IS DISTINCT FROM v_caller_org_id;

  IF v_cross_org_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '他の組織の予約は削除できません');
  END IF;
  
  -- 削除対象の予約番号を取得（ログ用）
  SELECT ARRAY_AGG(reservation_number) INTO v_reservation_numbers
  FROM reservations
  WHERE id = ANY(p_reservation_ids)
    AND organization_id = v_caller_org_id;
  
  -- 監査ログを記録
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    organization_id
  )
  SELECT 
    v_caller_id,
    'reservations.bulk_delete',
    'reservations',
    id,
    row_to_json(r.*)::JSONB,
    NULL,
    v_caller_org_id
  FROM reservations r
  WHERE r.id = ANY(p_reservation_ids)
    AND r.organization_id = v_caller_org_id;
  
  -- 削除を実行（自組織のみ）
  DELETE FROM reservations
  WHERE id = ANY(p_reservation_ids)
    AND organization_id = v_caller_org_id;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'deleted_reservation_numbers', v_reservation_numbers
  );
END;
$$;

-- =============================================================================
-- P0-D (2): admin_recalculate_reservation_prices にも組織境界チェック追加
-- =============================================================================
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
$$;

-- =============================================================================
-- P0-E: reservations_history SELECT ポリシー — is_org_admin() のみで全組織閲覧可能
-- =============================================================================
DROP POLICY IF EXISTS "reservations_history_select_staff_or_admin" ON public.reservations_history;

CREATE POLICY "reservations_history_select_org_scoped" ON public.reservations_history
  FOR SELECT USING (
    organization_id = get_user_organization_id()
  );

-- =============================================================================
-- P1-18: initialize_organization_data() に SET search_path 追加
-- =============================================================================
CREATE OR REPLACE FUNCTION public.initialize_organization_data()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.global_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.stores (name, short_name, status, capacity, rooms, color, is_temporary, temporary_dates, organization_id, address, phone_number, email, opening_date, manager_name)
  VALUES
    ('臨時会場1', '臨時1', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場2', '臨時2', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場3', '臨時3', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場4', '臨時4', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場5', '臨時5', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, '')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- P1-18: audit_generic_changes() に SET search_path 追加
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_generic_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_action text;
  v_resource_type text;
  v_resource_id uuid;
  v_org_id uuid;
  v_old_values jsonb;
  v_new_values jsonb;
BEGIN
  v_user_id := auth.uid();
  v_resource_type := TG_TABLE_NAME;

  IF TG_OP = 'INSERT' THEN
    v_action := v_resource_type || '.create';
    v_resource_id := NEW.id;
    v_new_values := to_jsonb(NEW);
    v_old_values := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := v_resource_type || '.update';
    v_resource_id := NEW.id;
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := v_resource_type || '.delete';
    v_resource_id := OLD.id;
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
    ELSE
      v_org_id := NEW.organization_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_org_id := NULL;
  END;

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, organization_id)
  VALUES (v_user_id, v_action, v_resource_type, v_resource_id, v_old_values, v_new_values, v_org_id);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit_generic_changes failed for %: %', v_resource_type, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- P1-21: auth_logs INSERT ポリシーを service_role のみに制限
-- =============================================================================
DROP POLICY IF EXISTS "認証システムはログを記録可能" ON public.auth_logs;

CREATE POLICY "auth_logs_insert_service_role_only" ON public.auth_logs
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );
