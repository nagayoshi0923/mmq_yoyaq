-- =====================================================================
-- 同じメールアドレスまたは電話番号でのクーポン重複付与を防止
-- Googleアカウント削除→再登録でuser_idが変わっても、メール/電話で重複チェック
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
  -- メールアドレスと電話番号の両方がない場合は処理をスキップ
  IF (NEW.email IS NULL OR NEW.email = '') AND (NEW.phone IS NULL OR NEW.phone = '') THEN
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
      AND (
        -- 顧客の組織と一致するキャンペーン
        organization_id = NEW.organization_id
      )
  LOOP
    -- 同じメールアドレスまたは電話番号で既にこのキャンペーンのクーポンが付与されていないかチェック
    SELECT COUNT(*) INTO v_existing_coupon_count
    FROM public.customer_coupons cc
    INNER JOIN public.customers c ON c.id = cc.customer_id
    WHERE cc.campaign_id = v_campaign.id
      AND c.id != NEW.id  -- 自分自身は除外
      AND (
        -- メールアドレスが一致
        (NEW.email IS NOT NULL AND NEW.email != '' AND c.email = NEW.email)
        OR
        -- 電話番号が一致（ハイフンやスペースを除去して比較）
        (NEW.phone IS NOT NULL AND NEW.phone != '' AND 
         regexp_replace(c.phone, '[-\s]', '', 'g') = regexp_replace(NEW.phone, '[-\s]', '', 'g'))
      );

    -- 既に付与済みの場合はスキップ
    IF v_existing_coupon_count > 0 THEN
      RAISE NOTICE 'クーポン付与スキップ: メール % / 電話 % は既にキャンペーン % のクーポンを所持', NEW.email, NEW.phone, v_campaign.name;
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
  '新規顧客登録時に自動でクーポンを付与（同一メールアドレスまたは電話番号での重複付与を防止）';
