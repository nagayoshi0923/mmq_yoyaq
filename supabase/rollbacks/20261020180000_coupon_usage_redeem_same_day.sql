-- 20261020180000_coupon_usage_redeem_same_day の巻き戻し。
-- 「もぎる（来店確認）」の関数を、公演当日の確認を入れる前（20261020130000 の時点）の本文に戻す。
-- 列・使用履歴・付いた来店確認の印は変えない。
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
