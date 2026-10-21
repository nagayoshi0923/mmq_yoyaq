-- participant_change_keeps_coupon_v1
-- マイページで参加人数を変えると合計が「単価×人数」に戻り、予約時のクーポン割引が消えていた。
-- 人数変更RPCで、使ったクーポンを配布時の条件のまま新しい合計に掛け直す。
-- 条件（最低利用金額など）を満たさなくなる人数は、割引を外さず変更自体を P0056 で止める。
-- 使用履歴（coupon_usages）の割引額は通常は変更禁止のため、人数変更RPCが同じ取引で指定した1件だけ付け直せるようにする。
-- 取消規定・変更期限のスナップショットなど他の列には触れない。

CREATE OR REPLACE FUNCTION public.update_reservation_participants(p_reservation_id uuid, p_new_count integer, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id UUID;
  v_old_count INTEGER;
  v_diff INTEGER;
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_org_id UUID;
  v_reservation_customer_id UUID;
  v_unit_price INTEGER;
  v_new_total_price INTEGER;
  v_new_final_price INTEGER;
  v_saved_discount INTEGER;
  v_usage RECORD;
  v_rules JSONB;
  v_min_amount INTEGER;
  v_discount INTEGER;
  v_old_applied INTEGER;
  v_used INTEGER := 0;
  v_coupon_old_sum INTEGER := 0;
  v_coupon_new_sum INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  -- 予約情報を取得
  SELECT schedule_event_id, participant_count, customer_id, organization_id, unit_price, discount_amount
  INTO v_event_id, v_old_count, v_reservation_customer_id, v_org_id, v_unit_price, v_saved_discount
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;

  -- reservation_actor_auth_v1: 旧引数は対象の照合用であり本人証明ではない。
  IF p_customer_id IS NOT NULL
     AND v_reservation_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  IF NOT COALESCE(public.reservation_actor_is_org_operator(v_org_id), false)
     AND NOT EXISTS (
       SELECT 1 FROM public.customers
       WHERE id = v_reservation_customer_id AND user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

  v_diff := p_new_count - v_old_count;

  -- 増加時のみ在庫確認（checked_in を含めて正確な空席数を計算）
  IF v_diff > 0 THEN
    SELECT COALESCE(max_participants, capacity, 8)
    INTO v_max_participants
    FROM schedule_events
    WHERE id = v_event_id
    FOR UPDATE;

    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_current_participants
    FROM reservations
    WHERE schedule_event_id = v_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    IF v_current_participants + v_diff > v_max_participants THEN
      RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0008';
    END IF;
  END IF;

  -- 料金を再計算（unit_price × 新人数）
  v_new_total_price := COALESCE(v_unit_price, 0) * p_new_count;

  -- participant_change_keeps_coupon_v1:
  -- 予約に使ったクーポンは、配布時の条件（rules_snapshot）のまま新しい合計で割引額を付け直す。
  --   定額: 同じ額（合計を超えない）／割合: 新しい合計 × 割合（四捨五入）。予約時の coupon_discount_for_event と同じ式。
  --   最低利用金額を下回る・割引が残らない場合は割引を外さず、人数変更そのものを止める（P0056）。
  -- 貸切メンバー個別の割引は人数と無関係なので触らない。請求へ反映していない旧利用も触らない。
  -- 店舗が手で入れた割引など、クーポン以外の割引額はそのまま残す。
  FOR v_usage IN
    SELECT cu.id, cu.discount_amount, ba.applied_amount, (gu.usage_id IS NOT NULL) AS is_member,
           COALESCE(cc.rules_snapshot, CASE WHEN camp.id IS NOT NULL THEN public.coupon_campaign_rules(camp) END) AS rules,
           COALESCE(NULLIF(btrim(camp.display_name), ''), NULLIF(btrim(camp.name), ''), 'クーポン') AS coupon_name
    FROM public.coupon_usages cu
    JOIN public.customer_coupons cc ON cc.id = cu.customer_coupon_id
    LEFT JOIN public.coupon_campaigns camp ON camp.id = cc.campaign_id
    LEFT JOIN public.coupon_usage_billing_applied ba ON ba.usage_id = cu.id
    LEFT JOIN public.private_group_coupon_uses gu ON gu.usage_id = cu.id
    WHERE cu.reservation_id = p_reservation_id
    ORDER BY cu.used_at, cu.id
    FOR UPDATE OF cu
  LOOP
    IF v_usage.is_member THEN
      v_used := v_used + v_usage.discount_amount;
      CONTINUE;
    END IF;
    -- 請求へ反映済みの利用だけ付け直す。反映記録の無い旧利用は、予約に割引額が入っていれば反映済みとみなす
    -- （restore_coupon_usage の「割引0・合計どおりなら未控除」と同じ判定）。
    IF v_usage.applied_amount IS NOT NULL THEN
      IF v_usage.applied_amount <= 0 THEN
        CONTINUE;
      END IF;
      v_old_applied := v_usage.applied_amount;
    ELSIF COALESCE(v_saved_discount, 0) > 0 THEN
      v_old_applied := v_usage.discount_amount;
    ELSE
      CONTINUE;
    END IF;

    v_rules := v_usage.rules;
    IF v_rules IS NULL OR COALESCE(v_rules->>'discount_type', '') NOT IN ('fixed', 'percentage') THEN
      RAISE EXCEPTION 'ご利用中のクーポン「%」の割引条件を確認できないため、人数を変更できません。店舗へお問い合わせください。',
        v_usage.coupon_name USING ERRCODE = 'P0056';
    END IF;

    v_min_amount := COALESCE((v_rules->>'min_order_amount')::integer, 0);
    IF v_new_total_price < v_min_amount THEN
      RAISE EXCEPTION 'ご利用中のクーポン「%」は合計¥%以上のご予約が対象です。%名に変更すると合計が¥%になり条件を満たさないため、人数を変更できません。人数を減らす場合は店舗へお問い合わせください。',
        v_usage.coupon_name, to_char(v_min_amount, 'FM999,999,999,990'), p_new_count,
        to_char(v_new_total_price, 'FM999,999,999,990') USING ERRCODE = 'P0056';
    END IF;

    v_discount := CASE v_rules->>'discount_type'
      WHEN 'fixed' THEN (v_rules->>'discount_amount')::integer
      WHEN 'percentage' THEN round(v_new_total_price::numeric * (v_rules->>'discount_amount')::numeric / 100)::integer
    END;
    v_discount := LEAST(v_discount, GREATEST(v_new_total_price - v_used, 0));
    IF v_discount IS NULL OR v_discount <= 0 THEN
      RAISE EXCEPTION 'ご利用中のクーポン「%」の割引が適用できなくなるため、%名には変更できません。店舗へお問い合わせください。',
        v_usage.coupon_name, p_new_count USING ERRCODE = 'P0056';
    END IF;

    IF v_discount <> v_usage.discount_amount THEN
      PERFORM set_config('mmq.coupon_usage_reprice', v_usage.id::text, true);
      UPDATE public.coupon_usages SET discount_amount = v_discount WHERE id = v_usage.id;
      PERFORM set_config('mmq.coupon_usage_reprice', '', true);
    END IF;
    UPDATE public.coupon_usage_billing_applied SET applied_amount = v_discount
    WHERE usage_id = v_usage.id AND applied_amount IS DISTINCT FROM v_discount;

    v_coupon_old_sum := v_coupon_old_sum + v_old_applied;
    v_coupon_new_sum := v_coupon_new_sum + v_discount;
    v_used := v_used + v_discount;
  END LOOP;

  v_saved_discount := GREATEST(COALESCE(v_saved_discount, 0) - v_coupon_old_sum, 0) + v_coupon_new_sum;
  v_new_final_price := GREATEST(v_new_total_price - v_saved_discount, 0);

  -- 予約の参加人数と料金を更新
  -- ※ この UPDATE で recalc_current_participants_trigger が発火し、
  --   schedule_events.current_participants を実数合計の絶対値に再計算する。
  --   以前はこの後に current_participants += v_diff を手動実行していたが、
  --   トリガーによる絶対値再計算と二重に加算され、満席ギリギリの公演で
  --   check 制約に違反していたため削除した（在庫の更新はトリガーに一任）。
  UPDATE reservations
  SET participant_count = p_new_count,
      base_price = v_new_total_price,
      total_price = v_new_total_price,
      discount_amount = v_saved_discount,
      final_price = v_new_final_price,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_coupon_performance_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.reservations; cc public.customer_coupons;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.customer_coupon_id IS DISTINCT FROM OLD.customer_coupon_id OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
   OR (NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
       -- participant_change_keeps_coupon_v1: 人数変更RPCが同じ取引の中で指定した使用履歴だけ、割引額の付け直しを許す。
       AND COALESCE(current_setting('mmq.coupon_usage_reprice', true), '') IS DISTINCT FROM OLD.id::text) THEN
   RAISE EXCEPTION '使用履歴の条件は変更できません。取消後に再利用してください' USING ERRCODE='P0028';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=NEW.customer_coupon_id;
 IF r.id IS NULL OR r.organization_id IS DISTINCT FROM cc.organization_id OR r.status NOT IN ('confirmed','checked_in')
  OR NOT public.can_use_coupon_reservation(cc.customer_id,r.id) THEN
  RAISE EXCEPTION '利用可能な予約を指定してください' USING ERRCODE='P0028';
 END IF;
 IF EXISTS(SELECT 1 FROM public.private_groups g JOIN public.private_group_members m ON m.group_id=g.id
 WHERE g.reservation_id=r.id AND g.organization_id=r.organization_id AND m.status='joined' AND m.coupon_id=cc.id
 AND m.user_id=(SELECT user_id FROM public.customers WHERE id=cc.customer_id)) THEN
  NEW.discount_amount:=public.coupon_discount_for_event_internal(cc.id,r.schedule_event_id,
    (SELECT coalesce(g.per_person_price,m.payment_amount,0) FROM public.private_group_members m JOIN public.private_groups g ON g.id=m.group_id
     WHERE g.reservation_id=r.id AND m.coupon_id=cc.id AND m.status='joined' LIMIT 1),cc.customer_id,r.id,
    (SELECT m.id FROM public.private_group_members m JOIN public.private_groups g ON g.id=m.group_id
     WHERE g.reservation_id=r.id AND m.coupon_id=cc.id AND m.status='joined' LIMIT 1));
 ELSE
  NEW.discount_amount:=public.coupon_discount_for_event(cc.id,r.schedule_event_id,r.total_price,cc.customer_id,r.id);
 END IF;
 RETURN NEW;
END;
$function$;
