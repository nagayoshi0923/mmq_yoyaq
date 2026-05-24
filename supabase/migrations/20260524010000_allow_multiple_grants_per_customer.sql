-- 20260524010000: customer_coupons の UNIQUE 制約を撤廃して
-- 1 顧客が同キャンペーンで複数枚クーポンを保持できるようにする
--
-- 背景:
--   coupon_campaigns.max_grants_per_customer カラムは追加済みだが、
--   customer_coupons (campaign_id, customer_id) UNIQUE が強制的に
--   「1 顧客 = 1 grant」を縛っており、設定値が無視されていた。
--   UI には「無制限」プレースホルダ表示されていたが実態は常に 1。
--
-- 変更:
--   1. 既存キャンペーンの NULL を 1 に backfill して現状動作を保持
--      （以降 NULL = 無制限 のセマンティクスとする）
--   2. UNIQUE (campaign_id, customer_id) を削除
--   3. 非 UNIQUE インデックスを追加（grant 時の count クエリ高速化）
--
-- 注意:
--   配布期間 (valid_from/valid_until) と 使用期間 (usage_valid_*, coupon_expiry_days)
--   は別概念。max_grants_per_customer はあくまで「配布期間内に何枚配るか」を制限する。

BEGIN;

-- 1. 既存キャンペーンの NULL は 1 として扱う（旧 UNIQUE 制約下の動作維持）
UPDATE public.coupon_campaigns
SET max_grants_per_customer = 1
WHERE max_grants_per_customer IS NULL;

-- 2. UNIQUE 制約を削除
ALTER TABLE public.customer_coupons
  DROP CONSTRAINT IF EXISTS customer_coupons_campaign_id_customer_id_key;

-- 3. 非 UNIQUE インデックス（既存 count クエリ用）
CREATE INDEX IF NOT EXISTS idx_customer_coupons_campaign_customer
  ON public.customer_coupons (campaign_id, customer_id);

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '✅ customer_coupons UNIQUE 撤廃完了';
  RAISE NOTICE '   既存キャンペーンの max_grants_per_customer は 1 に backfill';
  RAISE NOTICE '   今後 NULL = 無制限 / N = 1 顧客あたり最大 N 枚 の意味';
END $$;
