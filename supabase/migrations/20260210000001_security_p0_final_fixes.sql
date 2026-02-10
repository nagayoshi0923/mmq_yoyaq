-- =============================================================================
-- P0 セキュリティ最終修正 (2026-02-10)
-- 最終監査で検出された3つの P0 脆弱性を修正
-- =============================================================================

-- =============================================================================
-- P0-A: 危険な create_reservation_with_lock_v2 オーバーロードの削除
--
-- 20260202120000_security_p0_fixes.sql で追加された版は:
--   (UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, UUID, TEXT) → JSONB
-- p_base_price, p_total_price をクライアントから受け取り、そのまま DB に書く。
-- API 直叩きで料金0円の予約が作成可能。
--
-- 安全版（20260130233000 等）は:
--   (UUID, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) → UUID
-- サーバー側で料金を計算する。
-- =============================================================================

-- 1. 危険なオーバーロードを削除
-- PostgreSQL は引数の型リストで関数を区別する。
-- 危険版: (uuid, uuid, text, text, text, integer, integer, integer, text, text, uuid, text)
DROP FUNCTION IF EXISTS public.create_reservation_with_lock_v2(
  UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, UUID, TEXT
);

-- 2. 安全版が残っていることを確認（存在しなければエラー）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_reservation_with_lock_v2'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: create_reservation_with_lock_v2 の安全版が見つかりません。マイグレーションを中断します。';
  END IF;
END $$;

-- 3. オーバーロードが1つだけ残っていることを確認
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'create_reservation_with_lock_v2';

  IF v_count > 1 THEN
    RAISE EXCEPTION 'WARNING: create_reservation_with_lock_v2 が % 個存在します。手動確認が必要です。', v_count;
  END IF;

  RAISE NOTICE 'OK: create_reservation_with_lock_v2 は % 個（期待通り）', v_count;
END $$;


-- =============================================================================
-- P0-B: admin_update_reservation_fields に組織境界チェックを追加
--
-- 現状: role が admin/staff/license_admin であれば任意の予約を更新可能
-- 修正: 予約の organization_id と呼び出し元の organization_id を比較
-- =============================================================================

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

  -- ★ P0-B 修正: 組織境界チェック
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

  -- 予約の現在のステータス取得（★ FOR UPDATE でロック）
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
$$;


-- =============================================================================
-- P0-B: cancel_reservation_with_lock に組織境界チェックを追加
--
-- 現状: is_org_admin() がグローバル true → 他組織の予約もキャンセル可能
-- 修正: 予約の organization_id と呼び出し元の organization_id を比較
-- =============================================================================

-- cancel_reservation_with_lock には2つのオーバーロードがある:
-- (UUID, TEXT) と (UUID, UUID, TEXT)
-- パラメータ名が異なる場合 CREATE OR REPLACE できないため、先に DROP する

DROP FUNCTION IF EXISTS public.cancel_reservation_with_lock(UUID, TEXT);
DROP FUNCTION IF EXISTS public.cancel_reservation_with_lock(UUID, UUID, TEXT);

-- シグネチャ 1: (UUID, TEXT)
CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0020';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- ★ P0-B 修正: 組織境界チェック（自分の予約か、同組織の admin のみ許可）
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = v_reservation.customer_id AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin/staff
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0021';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- current_participants はトリガーが自動更新

  RETURN TRUE;
END;
$$;


-- シグネチャ 2: (UUID, UUID, TEXT) — customer_id 指定版
CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0020';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- ★ P0-B 修正: 組織境界チェック
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として — customer_id で照合）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = COALESCE(p_customer_id, v_reservation.customer_id)
        AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin/staff
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0021';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;


-- =============================================================================
-- P0-B: users テーブルの UPDATE RLS に組織境界を追加
--
-- 現状: is_admin() がグローバル true → 他組織のユーザーも更新可能
-- 修正: admin は自組織のユーザーのみ更新可能
-- =============================================================================

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;

CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    auth.role() = 'service_role'::text
    -- ★ admin は同組織のユーザーのみ（グローバル admin を防止）
    OR (
      is_admin()
      AND users.organization_id = get_user_organization_id()
    )
    OR id = auth.uid()
  )
  WITH CHECK (
    -- Service role: OK
    auth.role() = 'service_role'::text
    -- ★ admin は同組織のユーザーのみ
    OR (
      is_admin()
      AND users.organization_id = get_user_organization_id()
    )
    OR (
      id = auth.uid()
      AND email = (SELECT u2.email FROM public.users u2 WHERE u2.id = auth.uid())
      AND (
        -- (a) no-op: keep role/org unchanged
        (
          role = (SELECT u2.role FROM public.users u2 WHERE u2.id = auth.uid())
          AND organization_id = (SELECT u2.organization_id FROM public.users u2 WHERE u2.id = auth.uid())
        )
        OR
        -- (b) invitation-driven promotion (customer -> staff/admin) with org match
        (
          (SELECT u2.role FROM public.users u2 WHERE u2.id = auth.uid()) = 'customer'::app_role
          AND EXISTS (
            SELECT 1
            FROM public.organization_invitations oi
            WHERE oi.email = auth.email()
              AND oi.accepted_at IS NOT NULL
              AND oi.organization_id = users.organization_id
              AND (
                (users.role = 'admin'::app_role AND (('管理者' = ANY(oi.role)) OR ('admin' = ANY(oi.role))))
                OR
                (users.role = 'staff'::app_role)
              )
          )
        )
        OR
        -- (c) staff link repair (customer -> staff) if staff row exists and org matches
        (
          users.role = 'staff'::app_role
          AND EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid())
          AND users.organization_id = (
            SELECT s.organization_id FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1
          )
        )
      )
    )
  );


-- =============================================================================
-- 検証クエリ
-- =============================================================================

-- 1. create_reservation_with_lock_v2 のオーバーロード数を確認
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'create_reservation_with_lock_v2';
  RAISE NOTICE '✅ create_reservation_with_lock_v2: % 個のオーバーロード', v_count;
END $$;

-- 2. admin_update_reservation_fields が org チェックを含むことを確認
DO $$
DECLARE
  v_body TEXT;
BEGIN
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_update_reservation_fields'
  LIMIT 1;

  IF v_body ILIKE '%organization_id%' AND v_body ILIKE '%DISTINCT FROM%' THEN
    RAISE NOTICE '✅ admin_update_reservation_fields: 組織境界チェックあり';
  ELSE
    RAISE EXCEPTION '❌ admin_update_reservation_fields: 組織境界チェックが見つかりません';
  END IF;
END $$;

-- 3. users UPDATE ポリシーに org チェックを含むことを確認
DO $$
DECLARE
  v_qual TEXT;
BEGIN
  SELECT qual::TEXT INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'users'
    AND policyname = 'users_update_self_or_admin';

  IF v_qual ILIKE '%get_user_organization_id%' THEN
    RAISE NOTICE '✅ users_update_self_or_admin: 組織境界チェックあり';
  ELSE
    RAISE EXCEPTION '❌ users_update_self_or_admin: 組織境界チェックが見つかりません';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '=== P0 セキュリティ修正完了 ==='; END $$;
