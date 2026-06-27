-- 予約者タブのステータスUX Step1（DB・追補）
-- admin_update_reservation_fields の許可フィールド（UPDATE ホワイトリスト）に arrived_late を追加。
-- これが無いと reservationApi.update({arrived_late}) を送っても RPC は success:true を返しつつ
-- arrived_late を更新しない（サイレント失敗）。本番 live 定義（pg_get_functiondef）を土台に、
-- UPDATE の SET 句へ arrived_late を1行追加するのみ。権限/組織境界/遷移検証ロジックは不変。

CREATE OR REPLACE FUNCTION public.admin_update_reservation_fields(p_reservation_id uuid, p_updates jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_org_id UUID;
  v_reservation_org_id UUID;
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
  SELECT role::TEXT, organization_id
  INTO v_caller_role, v_caller_org_id
  FROM users
  WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('admin', 'staff', 'license_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '権限がありません');
  END IF;

  -- 組織境界チェック
  SELECT organization_id INTO v_reservation_org_id
  FROM reservations
  WHERE id = p_reservation_id;

  IF v_reservation_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- service_role 以外は自組織の予約のみ操作可能
  IF v_caller_org_id IS DISTINCT FROM v_reservation_org_id THEN
    RETURN jsonb_build_object('success', false, 'error', '他組織の予約は操作できません');
  END IF;

  -- 予約の現在のステータス取得（FOR UPDATE でロック）
  SELECT status INTO v_current_status
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

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

  -- 更新を実行（許可フィールドのみ）
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
    -- ★追加: 遅刻フラグ
    arrived_late = CASE
      WHEN p_updates ? 'arrived_late' THEN (p_updates->>'arrived_late')::boolean
      ELSE arrived_late
    END,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 更新後のデータを取得
  SELECT jsonb_build_object(
    'success', true,
    'reservation', row_to_json(r.*)
  ) INTO v_result
  FROM reservations r
  WHERE r.id = p_reservation_id;

  RETURN v_result;
END;
$function$;
