-- 予約に適用したクーポンの「もぎる（来店確認）」（社長決定 B、2026-10-20）。
-- クーポンの消費は予約確定時のまま（coupon_usages の行・割引額・残り回数は変えない）。
-- 来店時にお客様が「もぎる」を押すと、その使用履歴に「来店時に確認済み」の印（時刻・押した会員・経路）を付ける。
--   redeemed_at        来店確認の時刻（未確認は NULL）
--   redeemed_by_member 押した会員（customers.id。クーポンの持ち主）
--   redeemed_source    customer_present（予約に適用済みのクーポンを来店時にもぎった）
--                      venue_use（クーポンを付けずに予約し、来店時にその場でもぎって使った）
BEGIN;

ALTER TABLE public.coupon_usages
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz,
  ADD COLUMN IF NOT EXISTS redeemed_by_member uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redeemed_source text;

ALTER TABLE public.coupon_usages DROP CONSTRAINT IF EXISTS coupon_usages_redeemed_source_check;
ALTER TABLE public.coupon_usages ADD CONSTRAINT coupon_usages_redeemed_source_check
  CHECK (redeemed_source IS NULL OR redeemed_source IN ('customer_present', 'venue_use'));

COMMENT ON COLUMN public.coupon_usages.redeemed_at IS '来店時にお客様が「もぎる」を押した時刻（未確認は NULL）。消費は used_at の時点';
COMMENT ON COLUMN public.coupon_usages.redeemed_by_member IS '「もぎる」を押した会員（customers.id）';
COMMENT ON COLUMN public.coupon_usages.redeemed_source IS 'customer_present=予約に適用済みを来店時に確認 / venue_use=来店時にその場で使用';

-- 本人のクーポン・本人の予約（貸切の参加メンバー・スタッフ参加を含む）のときだけ印を付ける。
-- 既に確認済みなら何もせず成功を返す（二度押し・再送で時刻を書き換えない）。
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
