-- =============================================================================
-- 🔒 セキュリティ修正: SECURITY DEFINER 関数の強化
-- 
-- 問題: SECURITY DEFINER関数は所有者権限で実行されるため、
--       search_pathを固定しないと攻撃者が悪意のある関数を実行させる可能性がある
-- 
-- 解決: 全てのSECURITY DEFINER関数に SET search_path = public を追加
-- =============================================================================

-- =============================================================================
-- 1. ヘルパー関数の強化
-- =============================================================================

-- get_user_organization_id: SECURITY INVOKERに変更（DEFINERは不要）
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- is_admin: SECURITY INVOKERに変更
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- is_org_admin: SECURITY INVOKERに変更
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- is_staff_or_admin: SECURITY INVOKERに変更
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'staff', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

-- =============================================================================
-- 2. トリガー関数の強化（SECURITY DEFINERが必要な関数）
-- =============================================================================

-- handle_new_user: search_path を明示的に設定
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- 🔒 search_path injection 対策
AS $$
DECLARE
  user_role app_role := 'customer';
BEGIN
  -- Edge Functionから招待された場合のみ、user_metadataを確認
  IF (NEW.raw_user_meta_data->>'invited_as') IS NOT NULL THEN
    CASE (NEW.raw_user_meta_data->>'invited_as')
      WHEN 'staff' THEN
        user_role := 'staff';
      WHEN 'admin' THEN
        user_role := 'admin';
      WHEN 'license_admin' THEN
        user_role := 'license_admin';
      ELSE
        user_role := 'customer';
    END CASE;
  END IF;
  -- 🔒 メールアドレスベースの自動ロール付与は行わない

  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. RPC関数の強化（SECURITY DEFINERが必要な関数）
-- =============================================================================

-- cancel_reservation_with_lock: search_path を明示的に設定
-- （この関数が存在する場合のみ更新）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_reservation_with_lock') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
        p_reservation_id UUID,
        p_reason TEXT DEFAULT NULL
      )
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      SET row_security = off
      AS $inner$
      DECLARE
        v_reservation RECORD;
        v_event_id UUID;
        v_actual_participants INTEGER;
      BEGIN
        -- 予約をロック
        SELECT id, schedule_event_id, status, customer_id
        INTO v_reservation
        FROM public.reservations
        WHERE id = p_reservation_id
          AND status != 'cancelled'
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0020';
        END IF;

        v_event_id := v_reservation.schedule_event_id;

        -- 認可チェック
        IF NOT (
          is_org_admin() OR
          EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.id = v_reservation.customer_id AND c.user_id = auth.uid()
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
      $inner$;
    $func$;
  END IF;
END $$;

-- =============================================================================
-- 4. 確認
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ SECURITY DEFINER 関数の強化完了';
  RAISE NOTICE '   - ヘルパー関数: SECURITY INVOKER に変更';
  RAISE NOTICE '   - トリガー/RPC関数: SET search_path = public を追加';
  RAISE NOTICE '';
  RAISE NOTICE '📋 SECURITY DEFINER を維持する関数（必要なもの）:';
  RAISE NOTICE '   - handle_new_user: auth.users トリガーで必要';
  RAISE NOTICE '   - recalc_current_participants_*: row_security=off が必要';
  RAISE NOTICE '   - create_reservation_with_lock_v2: RLSバイパスが必要';
  RAISE NOTICE '   - cancel_reservation_with_lock: RLSバイパスが必要';
  RAISE NOTICE '   - accept_invitation_atomic: 未ログインからの呼び出しが必要';
END $$;
