-- 20261020130000_coupon_usage_redeem の巻き戻し。
-- 「もぎる（来店確認）」の関数と、使用履歴の来店確認の列（時刻・押した会員・経路）を消す。
-- クーポンの使用履歴そのもの（割引額・残り回数）は変わらない。付いていた来店確認の印は消える。
BEGIN;
DROP FUNCTION IF EXISTS public.redeem_coupon_usage(uuid, uuid, text);
ALTER TABLE public.coupon_usages DROP CONSTRAINT IF EXISTS coupon_usages_redeemed_source_check;
ALTER TABLE public.coupon_usages
  DROP COLUMN IF EXISTS redeemed_source,
  DROP COLUMN IF EXISTS redeemed_by_member,
  DROP COLUMN IF EXISTS redeemed_at;
COMMIT;
