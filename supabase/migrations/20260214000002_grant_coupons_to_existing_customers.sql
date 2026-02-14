-- =============================================
-- 既存顧客への一括クーポン付与マイグレーション
-- クインズワルツ組織の既存顧客で、まだクーポンを持っていない人に付与
-- =============================================

DO $$
DECLARE
  v_campaign_id UUID;
  v_expiry_days INTEGER;
  v_max_uses INTEGER;
  v_expires_at TIMESTAMPTZ;
  v_count INTEGER := 0;
  v_customer RECORD;
BEGIN
  -- アクティブな新規登録キャンペーンを取得
  SELECT id, coupon_expiry_days, max_uses_per_customer
  INTO v_campaign_id, v_expiry_days, v_max_uses
  FROM public.coupon_campaigns
  WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'
    AND trigger_type = 'registration'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_campaign_id IS NULL THEN
    RAISE NOTICE 'アクティブなキャンペーンが見つかりません。スキップします。';
    RETURN;
  END IF;

  -- 有効期限を計算（付与日から起算）
  IF v_expiry_days IS NOT NULL THEN
    v_expires_at := now() + (v_expiry_days || ' days')::INTERVAL;
  ELSE
    v_expires_at := NULL;
  END IF;

  RAISE NOTICE 'キャンペーンID: %, 有効期限: %, 使用回数: %', v_campaign_id, v_expires_at, v_max_uses;

  -- まだクーポンを持っていない既存顧客に付与
  FOR v_customer IN
    SELECT c.id, c.name
    FROM public.customers c
    WHERE c.organization_id = 'a0000000-0000-0000-0000-000000000001'
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_coupons cc
        WHERE cc.customer_id = c.id
          AND cc.campaign_id = v_campaign_id
      )
  LOOP
    INSERT INTO public.customer_coupons (
      campaign_id,
      customer_id,
      organization_id,
      uses_remaining,
      expires_at,
      status
    ) VALUES (
      v_campaign_id,
      v_customer.id,
      'a0000000-0000-0000-0000-000000000001',
      v_max_uses,
      v_expires_at,
      'active'
    )
    ON CONFLICT (campaign_id, customer_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '完了: % 名の既存顧客にクーポンを付与しました', v_count;
END $$;
