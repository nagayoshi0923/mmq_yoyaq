-- coupon_campaigns に「使用期間」(絶対日付) カラムを追加
--
-- 経緯 (Issue #252 関連の要望):
--   現状の coupon_expiry_days は「配布から N 日間」の相対設定のみ。
--   「使用できる期間」を絶対日付で指定したいケースがある。
--
-- 仕様:
--   - usage_valid_from: クーポンが使用可能になる日（NULL=配布即時から使用可）
--   - usage_valid_until: クーポンの使用期限（NULL=無期限 or coupon_expiry_days で決定）
--   - 既存 valid_from/until は「配布期間」(キャンペーンが有効=配布できる期間) として継続
--   - 既存 coupon_expiry_days は「配布から N 日間」の相対期限として継続
--   - 絶対 (usage_valid_until) と相対 (coupon_expiry_days) は併用しない (UIで排他)

ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS usage_valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usage_valid_until TIMESTAMPTZ;

COMMENT ON COLUMN public.coupon_campaigns.usage_valid_from IS
  'クーポン使用開始日 (絶対)。NULL なら配布即時から使用可能';
COMMENT ON COLUMN public.coupon_campaigns.usage_valid_until IS
  'クーポン使用期限 (絶対)。NULL なら無期限 (coupon_expiry_days があれば相対適用)';

NOTIFY pgrst, 'reload schema';
