-- =============================================================================
-- 20260214: クーポンキャンペーン機能
-- =============================================================================
--
-- 新規登録時にクーポンを自動付与し、予約時に手動で適用できるクーポン機能。
--
-- 内容:
-- 1. テーブル作成 (coupon_campaigns, customer_coupons, coupon_usages)
-- 2. reservations に coupon_usage_id カラム追加
-- 3. RLS ポリシー設定
-- 4. 新規登録時の自動付与トリガー
-- 5. create_reservation_with_lock_v2 のクーポン対応
-- 6. 初期キャンペーンデータ（クインズワルツ新規登録キャンペーン）
--
-- =============================================================================

-- =====================
-- 1. coupon_campaigns テーブル
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
-- 2. customer_coupons テーブル
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
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer ON public.customer_coupons(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_org ON public.customer_coupons(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_status ON public.customer_coupons(status) WHERE status = 'active';

COMMENT ON TABLE public.customer_coupons IS '顧客のクーポン保有・使用状況';

-- =====================
-- 3. coupon_usages テーブル
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

ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon_campaigns_select_own_org" ON public.coupon_campaigns;
CREATE POLICY "coupon_campaigns_select_own_org" ON public.coupon_campaigns
  FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    OR is_active = true
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

ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_coupons_select" ON public.customer_coupons;
CREATE POLICY "customer_coupons_select" ON public.customer_coupons
  FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
    OR
    (organization_id = get_user_organization_id() AND is_org_admin())
  );

DROP POLICY IF EXISTS "customer_coupons_insert_admin" ON public.customer_coupons;
CREATE POLICY "customer_coupons_insert_admin" ON public.customer_coupons
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

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
    OR is_org_admin()
  );

-- =====================
-- 6. updated_at トリガー
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

-- =====================
-- 7. 新規登録時の自動クーポン付与トリガー
-- =====================
CREATE OR REPLACE FUNCTION public.grant_registration_coupons()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_expires_at TIMESTAMPTZ;
BEGIN
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

DROP TRIGGER IF EXISTS trg_grant_registration_coupons ON public.customers;
CREATE TRIGGER trg_grant_registration_coupons
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_registration_coupons();

COMMENT ON FUNCTION public.grant_registration_coupons() IS
'顧客レコード作成時に、対象組織のアクティブな registration キャンペーンからクーポンを自動付与する';

-- =====================
-- 8. create_reservation_with_lock_v2 のクーポン対応版
-- =====================
-- 旧シグネチャ（9引数版）を削除してから新シグネチャで再作成
DROP FUNCTION IF EXISTS create_reservation_with_lock_v2(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_reservation_with_lock_v2(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_notes TEXT DEFAULT NULL,
  p_how_found TEXT DEFAULT NULL,
  p_reservation_number TEXT DEFAULT NULL,
  p_customer_coupon_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;

  v_event_org_id UUID;
  v_scenario_id UUID;
  v_store_id UUID;
  v_date DATE;
  v_start_time TIME;
  v_duration INTEGER;
  v_title TEXT;

  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;

  v_participation_fee INTEGER;
  v_participation_costs JSONB;
  v_time_slot TEXT;
  v_time_slot_cost JSONB;

  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_discount_amount INTEGER := 0;
  v_final_price INTEGER;
  v_requested_datetime TIMESTAMP;
  v_reservation_number TEXT;

  -- クーポン関連
  v_coupon RECORD;
  v_campaign RECORD;
  v_coupon_usage_id UUID;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  -- 公演行をロック + 組織/定員を取得
  SELECT organization_id,
         scenario_id,
         store_id,
         date,
         start_time,
         COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_scenario_id, v_store_id, v_date, v_start_time, v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 認可（admin / staff(自組織) / customer(本人+組織一致)）
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  SELECT user_id, organization_id
  INTO v_customer_user_id, v_customer_org_id
  FROM customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
  END IF;

  IF v_is_admin THEN
    NULL;
  ELSIF v_caller_org_id IS NOT NULL THEN
    IF v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  IF v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
    RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
  END IF;

  -- 在庫チェック（現在人数を集計）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  -- 料金計算（サーバー側）
  SELECT participation_fee, participation_costs, duration, title
  INTO v_participation_fee, v_participation_costs, v_duration, v_title
  FROM scenarios
  WHERE id = v_scenario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  -- time_slot 判定
  IF EXTRACT(HOUR FROM v_start_time) < 12 THEN
    v_time_slot := 'morning';
  ELSIF EXTRACT(HOUR FROM v_start_time) < 18 THEN
    v_time_slot := 'afternoon';
  ELSE
    v_time_slot := 'evening';
  END IF;

  v_time_slot_cost := NULL;
  IF v_participation_costs IS NOT NULL AND jsonb_typeof(v_participation_costs) = 'array' THEN
    SELECT elem
    INTO v_time_slot_cost
    FROM jsonb_array_elements(v_participation_costs) elem
    WHERE COALESCE(elem->>'status', 'active') = 'active'
      AND elem->>'time_slot' = v_time_slot
    LIMIT 1;

    IF v_time_slot_cost IS NULL THEN
      SELECT elem
      INTO v_time_slot_cost
      FROM jsonb_array_elements(v_participation_costs) elem
      WHERE COALESCE(elem->>'status', 'active') = 'active'
        AND elem->>'time_slot' = '通常'
      LIMIT 1;
    END IF;
  END IF;

  IF v_time_slot_cost IS NOT NULL THEN
    IF v_time_slot_cost->>'type' = 'percentage' THEN
      IF v_participation_fee IS NULL THEN
        RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
      END IF;
      v_unit_price := ROUND(v_participation_fee * (1 + (COALESCE((v_time_slot_cost->>'amount')::NUMERIC, 0) / 100)))::INTEGER;
    ELSE
      v_unit_price := COALESCE((v_time_slot_cost->>'amount')::INTEGER, NULL);
    END IF;
  ELSE
    v_unit_price := v_participation_fee;
  END IF;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  v_total_price := v_unit_price * p_participant_count;

  -- =====================
  -- クーポン検証・適用
  -- =====================
  IF p_customer_coupon_id IS NOT NULL THEN
    -- クーポンをロックして取得
    SELECT cc.*
    INTO v_coupon
    FROM customer_coupons cc
    WHERE cc.id = p_customer_coupon_id
      AND cc.customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_NOT_FOUND: 指定されたクーポンが見つかりません' USING ERRCODE = 'P0020';
    END IF;

    -- ステータスチェック
    IF v_coupon.status != 'active' THEN
      RAISE EXCEPTION 'COUPON_NOT_ACTIVE: このクーポンは利用できません（ステータス: %）', v_coupon.status USING ERRCODE = 'P0021';
    END IF;

    -- 残り回数チェック
    IF v_coupon.uses_remaining <= 0 THEN
      RAISE EXCEPTION 'COUPON_EXHAUSTED: このクーポンの利用回数を超えています' USING ERRCODE = 'P0022';
    END IF;

    -- 有効期限チェック
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      -- 期限切れの場合、ステータスも更新
      UPDATE customer_coupons SET status = 'expired' WHERE id = v_coupon.id;
      RAISE EXCEPTION 'COUPON_EXPIRED: このクーポンは有効期限を過ぎています' USING ERRCODE = 'P0023';
    END IF;

    -- キャンペーン情報を取得して検証
    SELECT camp.*
    INTO v_campaign
    FROM coupon_campaigns camp
    WHERE camp.id = v_coupon.campaign_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND: キャンペーン情報が見つかりません' USING ERRCODE = 'P0024';
    END IF;

    IF NOT v_campaign.is_active THEN
      RAISE EXCEPTION 'CAMPAIGN_INACTIVE: このキャンペーンは終了しています' USING ERRCODE = 'P0025';
    END IF;

    IF v_campaign.valid_from IS NOT NULL AND v_campaign.valid_from > now() THEN
      RAISE EXCEPTION 'CAMPAIGN_NOT_STARTED: このキャンペーンはまだ開始されていません' USING ERRCODE = 'P0026';
    END IF;

    IF v_campaign.valid_until IS NOT NULL AND v_campaign.valid_until < now() THEN
      RAISE EXCEPTION 'CAMPAIGN_ENDED: このキャンペーンは終了しています' USING ERRCODE = 'P0027';
    END IF;

    -- 対象チェック
    IF v_campaign.target_type = 'specific_organization' THEN
      IF NOT (v_event_org_id = ANY(v_campaign.target_ids)) THEN
        RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはこの組織の予約には使用できません' USING ERRCODE = 'P0028';
      END IF;
    ELSIF v_campaign.target_type = 'specific_scenarios' THEN
      IF NOT (v_scenario_id = ANY(v_campaign.target_ids)) THEN
        RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはこのシナリオの予約には使用できません' USING ERRCODE = 'P0028';
      END IF;
    END IF;
    -- target_type = 'all' の場合は常に適用可能

    -- 割引額を計算
    IF v_campaign.discount_type = 'fixed' THEN
      v_discount_amount := v_campaign.discount_amount;
    ELSIF v_campaign.discount_type = 'percentage' THEN
      v_discount_amount := ROUND(v_total_price * v_campaign.discount_amount / 100.0)::INTEGER;
    END IF;

    -- 割引額が合計を超えないようにする（最低0円）
    IF v_discount_amount > v_total_price THEN
      v_discount_amount := v_total_price;
    END IF;
  END IF;

  v_final_price := v_total_price - v_discount_amount;

  -- requested_datetime はイベントから確定
  v_requested_datetime := (v_date + v_start_time)::TIMESTAMP;

  -- reservation_number（未指定なら生成）
  IF p_reservation_number IS NULL OR length(trim(p_reservation_number)) = 0 THEN
    v_reservation_number := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  ELSE
    v_reservation_number := p_reservation_number;
  END IF;

  -- 予約を挿入
  INSERT INTO reservations (
    schedule_event_id,
    scenario_id,
    store_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    requested_datetime,
    duration,
    participant_count,
    participant_names,
    base_price,
    options_price,
    total_price,
    discount_amount,
    final_price,
    unit_price,
    payment_method,
    payment_status,
    status,
    customer_notes,
    reservation_number,
    created_by,
    organization_id,
    title
  ) VALUES (
    p_schedule_event_id,
    v_scenario_id,
    v_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    ARRAY[]::text[],
    v_total_price,
    0,
    v_total_price,
    v_discount_amount,
    v_final_price,
    v_unit_price,
    'onsite',
    'pending',
    'confirmed',
    p_notes,
    v_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(v_title, '')
  )
  RETURNING id INTO v_reservation_id;

  -- クーポン使用記録を作成
  IF p_customer_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
    INSERT INTO coupon_usages (
      customer_coupon_id,
      reservation_id,
      discount_amount
    ) VALUES (
      p_customer_coupon_id,
      v_reservation_id,
      v_discount_amount
    )
    RETURNING id INTO v_coupon_usage_id;

    -- 予約にクーポン使用IDを紐付け
    UPDATE reservations SET coupon_usage_id = v_coupon_usage_id WHERE id = v_reservation_id;

    -- クーポンの残り回数を更新
    UPDATE customer_coupons
    SET uses_remaining = uses_remaining - 1,
        status = CASE WHEN uses_remaining - 1 <= 0 THEN 'fully_used' ELSE 'active' END
    WHERE id = p_customer_coupon_id;
  END IF;

  -- current_participants を更新
  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_reservation_with_lock_v2(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION create_reservation_with_lock_v2(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) IS
'予約作成（v2 + クーポン対応）。料金/日時はサーバー側で確定。クーポンが指定された場合は検証・割引適用・使用記録を行う。';

-- =====================
-- 9. 初期キャンペーンデータ（クインズワルツ新規登録キャンペーン）
-- =====================
INSERT INTO public.coupon_campaigns (
  organization_id,
  name,
  description,
  discount_type,
  discount_amount,
  max_uses_per_customer,
  target_type,
  target_ids,
  trigger_type,
  valid_from,
  valid_until,
  coupon_expiry_days,
  is_active
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '新規登録キャンペーン',
  'MMQに新規登録いただいた方に、500円OFFクーポンをプレゼント！最大2回までご利用いただけます。',
  'fixed',
  500,
  2,
  'specific_organization',
  ARRAY['a0000000-0000-0000-0000-000000000001']::UUID[],
  'registration',
  now(),
  NULL,
  90,
  true
)
ON CONFLICT DO NOTHING;
