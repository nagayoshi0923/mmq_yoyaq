-- クーポンの「もぎる（来店確認）」の「公演当日か」の判定を、公演の日付（schedule_events.date）基準にそろえる（2026-10-20）。
-- 20261020180000 は reservations.requested_datetime の日本時間の日付で判定していたが、
-- requested_datetime が公演日時ではなく予約を作った時刻になっている予約がある
-- （例: スタッフ参加の予約 260919-8B88 は requested_datetime 9/19 12:28、公演は 10/11 13:00）。
-- その予約では公演当日に押しても断られていた。また夕方以降の公演では requested_datetime が日本時間で翌日にずれて入ることがある。
--
-- 予約後のクーポン使用（use_customer_coupon、20261020190000）と同じく、
-- 公演（schedule_events.date、日本時間の日付そのもの）を正とし、公演の無い予約だけ requested_datetime を Asia/Tokyo の日付にしたものを使う。
-- この「公演日」を返す補助関数 coupon_performance_day を足し、redeem_coupon_usage はそれを使う。
-- （use_customer_coupon は本文に同じ式を持つ。両方が同じ判定になることは supabase/tests/coupon_redeem_event_date.sql で確かめる。）
-- 断るときの文言・SQLSTATE・HINT（P0028 / not_performance_day）と、確認済みなら日付にかかわらず成功を返す動きは変えない。
BEGIN;

CREATE OR REPLACE FUNCTION public.coupon_performance_day(p_schedule_event_id uuid, p_requested_datetime timestamptz)
RETURNS date LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT COALESCE(
  (SELECT se.date FROM public.schedule_events se WHERE se.id = p_schedule_event_id),
  (p_requested_datetime AT TIME ZONE 'Asia/Tokyo')::date
 );
$$;
REVOKE ALL ON FUNCTION public.coupon_performance_day(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_performance_day(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_coupon_usage(p_user uuid, p_usage_id uuid, p_source text DEFAULT 'customer_present')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u public.coupon_usages; cc public.customer_coupons; r public.reservations; performance_day date;
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
 -- 20261020220000: 公演日は schedule_events.date を正とする（公演の無い予約だけ requested_datetime の日本時間の日付）
 performance_day := public.coupon_performance_day(r.schedule_event_id, r.requested_datetime);
 IF performance_day IS NULL OR performance_day <> (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
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
