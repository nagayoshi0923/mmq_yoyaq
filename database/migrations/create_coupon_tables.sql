-- =============================================================================
-- クーポンキャンペーン機能: テーブル・トリガー・RLS
-- =============================================================================
--
-- 目的:
-- - 組織単位でクーポンキャンペーンを定義
-- - 新規登録時に自動でクーポンを付与
-- - 予約作成時にクーポンを適用（サーバー側で検証・割引計算）
--
-- テーブル:
-- 1. coupon_campaigns - キャンペーン定義（組織単位）
-- 2. customer_coupons - 顧客のクーポン保有・使用状況
-- 3. coupon_usages    - クーポン使用履歴
--
-- =============================================================================

-- =====================
-- 1. coupon_campaigns
-- =====================
CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
  discount_amount INTEGER NOT NULL CHECK (discount_amount > 0),
  max_uses_per_customer INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_customer > 0),
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'specific_scenarios', 'specific_organization')),
  target_ids UUID[],
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('registration', 'manual')),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  coupon_expiry_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_campaigns_org ON public.coupon_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_coupon_campaigns_active ON public.coupon_campaigns(is_active) WHERE is_active = true;

COMMENT ON TABLE public.coupon_campaigns IS 'クーポンキャンペーン定義（組織単位）';

-- =====================
-- 2. customer_coupons
-- =====================
CREATE TABLE IF NOT EXISTS public.customer_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.coupon_campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uses_remaining INTEGER NOT NULL CHECK (uses_remaining >= 0),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_used', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一キャンペーン・同一顧客で重複付与を防止
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer ON public.customer_coupons(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_org ON public.customer_coupons(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_status ON public.customer_coupons(status) WHERE status = 'active';

COMMENT ON TABLE public.customer_coupons IS '顧客のクーポン保有・使用状況';

-- =====================
-- 3. coupon_usages
-- =====================
CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_coupon_id UUID NOT NULL REFERENCES public.customer_coupons(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  discount_amount INTEGER NOT NULL CHECK (discount_amount > 0),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON public.coupon_usages(customer_coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_reservation ON public.coupon_usages(reservation_id);

COMMENT ON TABLE public.coupon_usages IS 'クーポン使用履歴';

-- =====================
-- 4. reservations に coupon_usage_id カラム追加
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'coupon_usage_id'
  ) THEN
    ALTER TABLE public.reservations
      ADD COLUMN coupon_usage_id UUID REFERENCES public.coupon_usages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================
-- 5. RLS ポリシー
-- =====================

-- coupon_campaigns: 認証ユーザーは自組織のキャンペーンを閲覧可能
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon_campaigns_select_own_org" ON public.coupon_campaigns;
CREATE POLICY "coupon_campaigns_select_own_org" ON public.coupon_campaigns
  FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    OR is_active = true  -- アクティブなキャンペーンは顧客にも見える
  );

DROP POLICY IF EXISTS "coupon_campaigns_insert_admin" ON public.coupon_campaigns;
CREATE POLICY "coupon_campaigns_insert_admin" ON public.coupon_campaigns
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

DROP POLICY IF EXISTS "coupon_campaigns_update_admin" ON public.coupon_campaigns;
CREATE POLICY "coupon_campaigns_update_admin" ON public.coupon_campaigns
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

-- customer_coupons: 顧客は自分のクーポンのみ閲覧、管理者は自組織全体を閲覧
ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_coupons_select" ON public.customer_coupons;
CREATE POLICY "customer_coupons_select" ON public.customer_coupons
  FOR SELECT
  USING (
    -- 自分のクーポン（顧客のuser_idとauth.uid()を照合）
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
    OR
    -- 管理者は自組織のクーポンを閲覧
    (organization_id = get_user_organization_id() AND is_org_admin())
  );

-- customer_coupons の INSERT は SECURITY DEFINER 関数経由のみ（トリガー or RPC）
-- 直接INSERTは禁止
DROP POLICY IF EXISTS "customer_coupons_insert_admin" ON public.customer_coupons;
CREATE POLICY "customer_coupons_insert_admin" ON public.customer_coupons
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

-- coupon_usages: 顧客は自分の使用履歴のみ閲覧
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon_usages_select" ON public.coupon_usages;
CREATE POLICY "coupon_usages_select" ON public.coupon_usages
  FOR SELECT
  USING (
    customer_coupon_id IN (
      SELECT id FROM public.customer_coupons
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
    OR
    -- 管理者
    is_org_admin()
  );

-- =====================
-- 6. updated_at 自動更新トリガー
-- =====================
CREATE OR REPLACE FUNCTION public.update_coupon_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coupon_campaigns_updated_at ON public.coupon_campaigns;
CREATE TRIGGER trg_coupon_campaigns_updated_at
  BEFORE UPDATE ON public.coupon_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_coupon_updated_at();

DROP TRIGGER IF EXISTS trg_customer_coupons_updated_at ON public.customer_coupons;
CREATE TRIGGER trg_customer_coupons_updated_at
  BEFORE UPDATE ON public.customer_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_coupon_updated_at();
