-- 20260302100004: admin_delete_reservations_by_schedule_event_ids で RLS を確実にバイパス
-- 
-- 問題: SECURITY DEFINER だけでは Supabase 環境で RLS をバイパスできない場合がある
-- 原因: 関数のオーナーが postgres でも、セッションレベルの row_security 設定が有効な場合がある
--
-- 解決策: SET row_security = off を関数定義に追加
--         これにより、この関数の実行中は RLS が完全に無効化される

CREATE OR REPLACE FUNCTION public.admin_delete_reservations_by_schedule_event_ids(
  p_schedule_event_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off  -- ★ RLS を確実にバイパス
AS $$
DECLARE
  v_event_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_is_staff_or_admin BOOLEAN;
  v_distinct_orgs INTEGER;
  v_deleted INTEGER;
  v_reservation_ids UUID[];
BEGIN
  -- 空の配列チェック
  IF p_schedule_event_ids IS NULL OR array_length(p_schedule_event_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- 対象イベントの組織を確認
  SELECT COUNT(DISTINCT organization_id)
  INTO v_distinct_orgs
  FROM schedule_events
  WHERE id = ANY(p_schedule_event_ids);

  IF v_distinct_orgs IS NULL OR v_distinct_orgs = 0 THEN
    RETURN 0;
  END IF;

  -- 複数組織のイベントを同時に削除しようとしている場合はエラー
  IF v_distinct_orgs > 1 THEN
    RAISE EXCEPTION 'MULTI_ORG_NOT_ALLOWED' USING ERRCODE = 'P0102';
  END IF;

  -- 対象イベントの組織IDを取得
  SELECT organization_id
  INTO v_event_org_id
  FROM schedule_events
  WHERE id = ANY(p_schedule_event_ids)
  LIMIT 1;

  -- 呼び出し元の組織と権限を確認
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();
  v_is_staff_or_admin := is_staff_or_admin();

  -- スタッフまたは管理者でない場合はエラー
  IF NOT v_is_staff_or_admin THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_STAFF' USING ERRCODE = 'P0010';
  END IF;

  -- 管理者でない場合は組織の一致を確認
  IF NOT v_is_admin THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id IS DISTINCT FROM v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  -- 削除対象の予約IDを取得（row_security = off なので RLS なしで取得）
  SELECT ARRAY_AGG(id)
  INTO v_reservation_ids
  FROM reservations
  WHERE schedule_event_id = ANY(p_schedule_event_ids);

  -- 予約がない場合は0を返す
  IF v_reservation_ids IS NULL OR array_length(v_reservation_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- ============================================================
  -- 依存テーブルの削除（row_security = off で RLS をバイパス）
  -- ============================================================

  -- 1. coupon_usages を先に削除（循環参照対策）
  DELETE FROM coupon_usages
  WHERE reservation_id = ANY(v_reservation_ids);

  -- 2. gm_availability_responses を削除
  DELETE FROM gm_availability_responses
  WHERE reservation_id = ANY(v_reservation_ids);

  -- 3. booking_email_queue を削除（存在する場合）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_email_queue') THEN
    DELETE FROM booking_email_queue
    WHERE reservation_id = ANY(v_reservation_ids);
  END IF;

  -- 4. reservations を削除
  DELETE FROM reservations
  WHERE id = ANY(v_reservation_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 関数の権限を設定
GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_schedule_event_ids(UUID[]) TO authenticated;

-- =====================
-- 確認用NOTICE
-- =====================
DO $$
BEGIN
  RAISE NOTICE '✅ admin_delete_reservations_by_schedule_event_ids 関数を修正しました';
  RAISE NOTICE '   - SET row_security = off を追加（RLS を確実にバイパス）';
END $$;
