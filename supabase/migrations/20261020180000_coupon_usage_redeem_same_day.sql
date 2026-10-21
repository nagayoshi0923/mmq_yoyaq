-- クーポンの「もぎる（来店確認）」は公演当日だけ押せるようにする（2026-10-20）。
-- これまでは日付の確認が無く、先の予約（2099 年でも）に対して来店確認ができてしまった。
-- redeemed_source が customer_present / venue_use のどちらでも、予約の公演日
-- （reservations.requested_datetime を Asia/Tokyo の日付にしたもの）が今日（Asia/Tokyo）のときだけ印を付ける。
-- それ以外は ERRCODE 'P0028'・HINT 'not_performance_day' で「公演当日に押してください」を返す。
-- 既に確認済み（redeemed_at あり）のときは、日付にかかわらず今までどおり成功を返す（二度押し・再送）。
BEGIN;

CREATE OR REPLACE FUNCTION public.redeem_coupon_usage(p_user uuid, p_usage_id uuid, p_source text DEFAULT 'customer_present')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u public.coupon_usages; cc public.customer_coupons; r public.reservations;
BEGIN
 IF p_source IS NULL OR p_source NOT IN ('customer_present', 'venue_use') THEN
  RAISE EXCEPTION '指定を確認してください' USING ERRCODE = 'P0028';
 END IF;
 SELECT cu.* INTO u FROM public.coupon_usages cu
  JOIN public.customer_coupons c ON c.id = cu.customer_coupon_id
  JOIN public.customers owner ON owner.id = c.customer_id
  WHERE cu.id = p_usage_id AND owner.user_id = p_user
  FOR UPDATE OF cu;
 IF u.id IS NULL THEN RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE = 'P0028'; END IF;
 SELECT * INTO cc FROM public.customer_coupons WHERE id = u.customer_coupon_id;
 SELECT * INTO r FROM public.reservations WHERE id = u.reservation_id AND organization_id = cc.organization_id;
 IF r.id IS NULL OR r.status NOT IN ('confirmed', 'checked_in') OR NOT public.can_use_coupon_reservation(cc.customer_id, r.id) THEN
  RAISE EXCEPTION 'ご本人の予約を指定してください' USING ERRCODE = 'P0028';
 END IF;
 IF u.redeemed_at IS NOT NULL THEN
  RETURN jsonb_build_object('success', true, 'usage_id', u.id, 'redeemed_at', u.redeemed_at, 'already_redeemed', true);
 END IF;
 IF r.requested_datetime IS NULL
    OR (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date <> (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
  RAISE EXCEPTION '公演当日に押してください' USING ERRCODE = 'P0028', HINT = 'not_performance_day';
 END IF;
 UPDATE public.coupon_usages
  SET redeemed_at = now(), redeemed_by_member = cc.customer_id, redeemed_source = p_source
  WHERE id = u.id
  RETURNING * INTO u;
 RETURN jsonb_build_object('success', true, 'usage_id', u.id, 'redeemed_at', u.redeemed_at, 'already_redeemed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_coupon_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_usage(uuid, uuid, text) TO service_role;

COMMIT;
