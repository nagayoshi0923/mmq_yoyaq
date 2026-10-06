-- rollback: 関数を 2026-10-06 時点の本番の定義に戻す（組織をまたいで届く状態に戻るので、戻すのは業務が止まった場合だけ）
CREATE OR REPLACE FUNCTION public.admin_delete_reservations_by_schedule_event_ids(p_schedule_event_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_recalculate_reservation_prices(p_reservation_id uuid, p_participant_names text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;

  v_participant_count INTEGER;
  v_unit_price INTEGER;
  v_options_price INTEGER;
  v_discount_amount INTEGER;

  v_base_price INTEGER;
  v_total_price INTEGER;
  v_final_price INTEGER;
BEGIN
  -- ロックして値を取得
  SELECT organization_id,
         participant_count,
         unit_price,
         options_price,
         discount_amount,
         base_price
  INTO v_reservation_org_id,
       v_participant_count,
       v_unit_price,
       v_options_price,
       v_discount_amount,
       v_base_price
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

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

  -- unit_price が無い場合は base_price / participant_count から推定
  IF v_unit_price IS NULL THEN
    IF v_participant_count > 0 AND v_base_price IS NOT NULL THEN
      v_unit_price := CEIL(v_base_price::numeric / v_participant_count::numeric)::integer;
    ELSE
      v_unit_price := 0;
    END IF;
  END IF;

  v_options_price := COALESCE(v_options_price, 0);
  v_discount_amount := COALESCE(v_discount_amount, 0);

  v_base_price := v_unit_price * COALESCE(v_participant_count, 0);
  v_total_price := v_base_price + v_options_price;
  v_final_price := v_total_price - v_discount_amount;

  UPDATE reservations
  SET
    participant_names = COALESCE(p_participant_names, participant_names),
    unit_price = v_unit_price,
    base_price = v_base_price,
    total_price = v_total_price,
    final_price = v_final_price,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_private_group_schedules(p_group_ids uuid[])
 RETURNS TABLE(group_id uuid, requested_datetime text, store_id uuid, store_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pg.id::uuid AS group_id,
    r.requested_datetime::text,
    r.store_id::uuid,
    s.name::text AS store_name
  FROM private_groups pg
  JOIN reservations r ON r.id = pg.reservation_id
  LEFT JOIN stores s ON s.id = r.store_id
  WHERE pg.id = ANY(p_group_ids)
    AND (
      -- グループメンバー（参加済み）
      EXISTS (
        SELECT 1 FROM private_group_members pgm
        WHERE pgm.group_id = pg.id
          AND pgm.user_id = auth.uid()
          AND pgm.status = 'joined'
      )
      -- スタッフ・管理者
      OR pg.organization_id = get_user_organization_id()
      OR is_org_admin()
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_recalculate_reservation_prices(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_fix_inventory_consistency() TO authenticated;
