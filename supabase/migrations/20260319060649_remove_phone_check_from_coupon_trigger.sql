-- =====================================================================
-- 電話番号での重複チェックを廃止
-- 理由: 電話番号の真正性を確認できないため、他人の番号を使われる可能性がある
-- 重複防止は UNIQUE 制約 (campaign_id, customer_id) とメールアドレスで担保
-- =====================================================================

CREATE OR REPLACE FUNCTION public.grant_registration_coupons()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_expires_at TIMESTAMPTZ;
  v_existing_coupon_count INTEGER;
BEGIN
  -- メールアドレスがない場合は処理をスキップ
  -- NOTE: 電話番号での重複チェックは廃止（真正性を確認できないため）
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  -- trigger_type = 'registration' かつアクティブなキャンペーンを検索
  FOR v_campaign IN
    SELECT *
    FROM public.coupon_campaigns
    WHERE trigger_type = 'registration'
      AND is_active = true
      AND (valid_from IS NULL OR valid_from <= now())
      AND (valid_until IS NULL OR valid_until >= now())
      AND organization_id = NEW.organization_id
  LOOP
    -- 同じメールアドレスで既にこのキャンペーンのクーポンが付与されていないかチェック
    -- NOTE: 電話番号でのチェックは廃止
    SELECT COUNT(*) INTO v_existing_coupon_count
    FROM public.customer_coupons cc
    INNER JOIN public.customers c ON c.id = cc.customer_id
    WHERE cc.campaign_id = v_campaign.id
      AND c.id != NEW.id  -- 自分自身は除外
      AND NEW.email IS NOT NULL 
      AND NEW.email != '' 
      AND c.email = NEW.email;

    -- 既に付与済みの場合はスキップ
    IF v_existing_coupon_count > 0 THEN
      RAISE NOTICE 'クーポン付与スキップ: メール % は既にキャンペーン % のクーポンを所持', NEW.email, v_campaign.name;
      CONTINUE;
    END IF;

    -- 有効期限を計算
    IF v_campaign.coupon_expiry_days IS NOT NULL THEN
      v_expires_at := now() + (v_campaign.coupon_expiry_days || ' days')::INTERVAL;
    ELSE
      v_expires_at := NULL;
    END IF;

    -- クーポンを付与（重複防止は UNIQUE 制約で保護）
    INSERT INTO public.customer_coupons (
      campaign_id,
      customer_id,
      organization_id,
      uses_remaining,
      expires_at,
      status
    ) VALUES (
      v_campaign.id,
      NEW.id,
      v_campaign.organization_id,
      v_campaign.max_uses_per_customer,
      v_expires_at,
      'active'
    )
    ON CONFLICT (campaign_id, customer_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_registration_coupons() IS
  '新規顧客登録時に自動でクーポンを付与（同一メールアドレスでの重複付与を防止、電話番号チェックは廃止）';
