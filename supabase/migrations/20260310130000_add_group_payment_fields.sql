-- 貸切グループの個別会計機能を追加
-- 各メンバーが参加費を個別に支払い、クーポンを適用できるようにする
-- 作成日: 2026-03-10

-- =============================================================================
-- 1. private_groups テーブルに料金情報カラムを追加
-- =============================================================================
ALTER TABLE public.private_groups
ADD COLUMN IF NOT EXISTS total_price INTEGER,
ADD COLUMN IF NOT EXISTS per_person_price INTEGER;

COMMENT ON COLUMN public.private_groups.total_price IS '貸切合計金額（円）';
COMMENT ON COLUMN public.private_groups.per_person_price IS '1人あたりの参加費（円）= total_price / target_participant_count';

-- =============================================================================
-- 2. private_group_members テーブルに支払い情報・アクセスPINカラムを追加
-- =============================================================================
ALTER TABLE public.private_group_members
ADD COLUMN IF NOT EXISTS payment_amount INTEGER,
ADD COLUMN IF NOT EXISTS coupon_id UUID,
ADD COLUMN IF NOT EXISTS coupon_discount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_amount INTEGER,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
ADD COLUMN IF NOT EXISTS access_pin TEXT;

-- couponsテーブルが存在する場合のみ外部キー制約を追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupons') THEN
    ALTER TABLE public.private_group_members
    ADD CONSTRAINT fk_private_group_members_coupon_id
    FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMENT ON COLUMN public.private_group_members.payment_amount IS '支払い予定額（クーポン適用前）';
COMMENT ON COLUMN public.private_group_members.coupon_id IS '適用したクーポンID';
COMMENT ON COLUMN public.private_group_members.coupon_discount IS 'クーポン割引額（円）';
COMMENT ON COLUMN public.private_group_members.final_amount IS '最終支払い額（クーポン適用後）';
COMMENT ON COLUMN public.private_group_members.payment_status IS '支払い状況: pending=未払い, paid=支払い済み, refunded=返金済み';
COMMENT ON COLUMN public.private_group_members.access_pin IS 'ゲストユーザー用アクセスPIN（4桁）';

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_private_group_members_coupon_id ON public.private_group_members(coupon_id);
CREATE INDEX IF NOT EXISTS idx_private_group_members_payment_status ON public.private_group_members(payment_status);

-- =============================================================================
-- 3. クーポンを適用する関数
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_coupon_to_group_member(
  p_member_id UUID,
  p_coupon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_coupon RECORD;
  v_group RECORD;
  v_discount INTEGER;
  v_final_amount INTEGER;
BEGIN
  -- メンバー情報を取得
  SELECT * INTO v_member FROM public.private_group_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'メンバーが見つかりません');
  END IF;

  -- グループ情報を取得
  SELECT * INTO v_group FROM public.private_groups WHERE id = v_member.group_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'グループが見つかりません');
  END IF;

  -- クーポン情報を取得・検証
  SELECT * INTO v_coupon FROM public.coupons WHERE id = p_coupon_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'クーポンが見つかりません');
  END IF;

  -- クーポンの有効性チェック
  IF v_coupon.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'このクーポンは使用できません');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'クーポンの有効期限が切れています');
  END IF;

  -- 所有者チェック（ログインユーザーのクーポンか）
  IF v_coupon.customer_id IS NOT NULL AND v_member.user_id IS NOT NULL THEN
    DECLARE
      v_customer_user_id UUID;
    BEGIN
      SELECT user_id INTO v_customer_user_id FROM public.customers WHERE id = v_coupon.customer_id;
      IF v_customer_user_id != v_member.user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'このクーポンは使用できません');
      END IF;
    END;
  END IF;

  -- 割引額を計算
  v_discount := LEAST(v_coupon.discount_amount, COALESCE(v_member.payment_amount, v_group.per_person_price, 0));
  v_final_amount := GREATEST(0, COALESCE(v_member.payment_amount, v_group.per_person_price, 0) - v_discount);

  -- メンバーのクーポン情報を更新
  UPDATE public.private_group_members
  SET 
    coupon_id = p_coupon_id,
    coupon_discount = v_discount,
    final_amount = v_final_amount,
    payment_amount = COALESCE(payment_amount, v_group.per_person_price)
  WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'success', true,
    'discount', v_discount,
    'final_amount', v_final_amount,
    'coupon_code', v_coupon.code
  );
END;
$$;

COMMENT ON FUNCTION public.apply_coupon_to_group_member IS 'グループメンバーにクーポンを適用する';

-- =============================================================================
-- 4. クーポン適用を解除する関数
-- =============================================================================
CREATE OR REPLACE FUNCTION public.remove_coupon_from_group_member(
  p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_group RECORD;
BEGIN
  -- メンバー情報を取得
  SELECT * INTO v_member FROM public.private_group_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'メンバーが見つかりません');
  END IF;

  -- グループ情報を取得
  SELECT * INTO v_group FROM public.private_groups WHERE id = v_member.group_id;

  -- クーポン情報をクリア
  UPDATE public.private_group_members
  SET 
    coupon_id = NULL,
    coupon_discount = 0,
    final_amount = COALESCE(payment_amount, v_group.per_person_price, 0)
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.remove_coupon_from_group_member IS 'グループメンバーのクーポン適用を解除する';
