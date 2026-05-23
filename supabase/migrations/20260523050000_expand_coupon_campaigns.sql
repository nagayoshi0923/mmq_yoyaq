-- クーポンキャンペーンの詳細設定カラムを拡張
--
-- 経緯 (Issue #80 完了後の要望): 配布・使用・表示・運用の各観点で
--   設定したい項目が多く、現状のフォームでは足りない。
--   詳細設定ページを新設するにあたり、必要なカラムをまとめて追加。

-- ===== B群: 配布関連 =====
ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS max_total_grants INTEGER,
  ADD COLUMN IF NOT EXISTS max_grants_per_customer INTEGER,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS notify_on_grant BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.coupon_campaigns.max_total_grants IS
  '配布数の上限（NULL=無制限）';
COMMENT ON COLUMN public.coupon_campaigns.max_grants_per_customer IS
  '1顧客あたりの配布数上限（NULL=無制限、デフォルトは1枚運用想定）';
COMMENT ON COLUMN public.coupon_campaigns.coupon_code IS
  '顧客が入力するクーポンコード（NULLなら管理者付与のみ）';
COMMENT ON COLUMN public.coupon_campaigns.notify_on_grant IS
  '付与時に顧客へメール通知するか';

-- 同一組織内で coupon_code を一意にする部分インデックス（NULL除く）
CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_coupon_code_unique
  ON public.coupon_campaigns (organization_id, coupon_code)
  WHERE coupon_code IS NOT NULL;

-- ===== C群: 使用関連 =====
ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS min_order_amount INTEGER,
  ADD COLUMN IF NOT EXISTS combinable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allowed_weekdays INTEGER[],
  ADD COLUMN IF NOT EXISTS allowed_time_slots TEXT[];

COMMENT ON COLUMN public.coupon_campaigns.min_order_amount IS
  '最低利用金額（円）。NULL=制限なし';
COMMENT ON COLUMN public.coupon_campaigns.combinable IS
  '他クーポンとの併用可否';
COMMENT ON COLUMN public.coupon_campaigns.allowed_weekdays IS
  '使用可能な曜日（0=日曜 〜 6=土曜の配列）。NULL=全曜日';
COMMENT ON COLUMN public.coupon_campaigns.allowed_time_slots IS
  '使用可能な時間帯（朝公演/昼公演/夜公演など）。NULL=全時間帯';

-- ===== D群: 顧客向け表示 =====
ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS display_image_url TEXT,
  ADD COLUMN IF NOT EXISTS customer_terms TEXT,
  ADD COLUMN IF NOT EXISTS internal_memo TEXT;

COMMENT ON COLUMN public.coupon_campaigns.display_name IS
  '顧客向けクーポン表示名（NULLならキャンペーン名を流用）';
COMMENT ON COLUMN public.coupon_campaigns.display_image_url IS
  'クーポン画像のURL（任意）';
COMMENT ON COLUMN public.coupon_campaigns.customer_terms IS
  '顧客向け利用条件文（細かい注意事項）';
COMMENT ON COLUMN public.coupon_campaigns.internal_memo IS
  '内部メモ（管理者のみ閲覧）';

-- ===== E群: 運用 =====
ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS on_cancel TEXT NOT NULL DEFAULT 'restore';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'coupon_campaigns_on_cancel_check'
  ) THEN
    ALTER TABLE public.coupon_campaigns
      ADD CONSTRAINT coupon_campaigns_on_cancel_check
      CHECK (on_cancel IN ('restore', 'forfeit'));
  END IF;
END $$;

COMMENT ON COLUMN public.coupon_campaigns.on_cancel IS
  '予約キャンセル時の挙動: restore=クーポン返却 / forfeit=失効';

NOTIFY pgrst, 'reload schema';
