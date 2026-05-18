-- =============================================================================
-- Phase 1: customers プラットフォーム共通化 + RLS 書き直し
--
-- 目的: マルチテナント対応の基盤整備
--   - ログイン済み顧客 (user_id IS NOT NULL) → organization_id = NULL（プラットフォーム共通）
--   - ゲスト顧客 (user_id IS NULL)           → organization_id NOT NULL のまま（現状維持）
--   - org 依存の統計・メモを customer_org_stats に分離
--   - RLS を全面書き直し（organization_id nullable に対応）
--
-- 注意: organization_id nullable 化と RLS 書き直しは同一ファイルで実行すること
--       分けると一時的に全顧客データにアクセス不能になる
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. customer_org_stats テーブル作成
-- =============================================================================

CREATE TABLE public.customer_org_stats (
  customer_id     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notes           text,
  visit_count     integer     NOT NULL DEFAULT 0,
  total_spent     integer     NOT NULL DEFAULT 0,
  last_visit      date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, organization_id)
);

ALTER TABLE public.customer_org_stats ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. ログイン済み顧客のデータ移行
--    - 全 org レコードの統計・メモ → customer_org_stats
--    - 同一 user_id の重複レコード → 最古のレコードに統合
--    - canonical レコードの organization_id → NULL
-- =============================================================================

DO $$
DECLARE
  v_user_id       uuid;
  v_canonical_id  uuid;
  v_dup_id        uuid;
BEGIN
  -- user_id を持つ顧客を user_id ごとに処理
  FOR v_user_id IN
    SELECT DISTINCT user_id
    FROM public.customers
    WHERE user_id IS NOT NULL
  LOOP
    -- canonical = 最も古いレコード
    SELECT id INTO v_canonical_id
    FROM public.customers
    WHERE user_id = v_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- 全 org レコードの統計・メモを customer_org_stats に移行
    INSERT INTO public.customer_org_stats (
      customer_id, organization_id, notes, visit_count, total_spent, last_visit
    )
    SELECT
      v_canonical_id,
      organization_id,
      notes,
      COALESCE(visit_count, 0),
      COALESCE(total_spent, 0),
      last_visit
    FROM public.customers
    WHERE user_id = v_user_id
      AND organization_id IS NOT NULL
    ON CONFLICT (customer_id, organization_id) DO NOTHING;

    -- 重複レコード（canonical 以外）の FK を canonical に付け替えてから削除
    FOR v_dup_id IN
      SELECT id
      FROM public.customers
      WHERE user_id = v_user_id
        AND id <> v_canonical_id
    LOOP
      -- reservations (ON DELETE SET NULL なので先に付け替え)
      UPDATE public.reservations
      SET customer_id = v_canonical_id
      WHERE customer_id = v_dup_id;

      -- customer_coupons (UNIQUE: campaign_id, customer_id)
      -- canonical 側に同一 campaign が既にあれば重複行を削除
      DELETE FROM public.customer_coupons
      WHERE customer_id = v_dup_id
        AND campaign_id IN (
          SELECT campaign_id FROM public.customer_coupons
          WHERE customer_id = v_canonical_id
        );
      UPDATE public.customer_coupons
      SET customer_id = v_canonical_id
      WHERE customer_id = v_dup_id;

      -- scenario_likes (UNIQUE: customer_id, scenario_id)
      DELETE FROM public.scenario_likes
      WHERE customer_id = v_dup_id
        AND scenario_id IN (
          SELECT scenario_id FROM public.scenario_likes
          WHERE customer_id = v_canonical_id
        );
      UPDATE public.scenario_likes
      SET customer_id = v_canonical_id
      WHERE customer_id = v_dup_id;

      -- scenario_ratings (UNIQUE: customer_id, scenario_master_id)
      DELETE FROM public.scenario_ratings
      WHERE customer_id = v_dup_id
        AND scenario_master_id IN (
          SELECT scenario_master_id FROM public.scenario_ratings
          WHERE customer_id = v_canonical_id
        );
      UPDATE public.scenario_ratings
      SET customer_id = v_canonical_id
      WHERE customer_id = v_dup_id;

      -- その他の CASCADE テーブル
      UPDATE public.manual_play_history SET customer_id = v_canonical_id WHERE customer_id = v_dup_id;
      UPDATE public.user_notifications  SET customer_id = v_canonical_id WHERE customer_id = v_dup_id;
      UPDATE public.waitlist            SET customer_id = v_canonical_id WHERE customer_id = v_dup_id;

      -- 重複レコードを削除（CASCADE で残存行も削除される）
      DELETE FROM public.customers WHERE id = v_dup_id;
    END LOOP;

    -- canonical レコードの organization_id を NULL に（プラットフォーム共通化）
    UPDATE public.customers
    SET organization_id = NULL
    WHERE id = v_canonical_id;

  END LOOP;
END $$;

-- =============================================================================
-- 3. スキーマ変更
-- =============================================================================

-- organization_id を nullable に
ALTER TABLE public.customers
  ALTER COLUMN organization_id DROP NOT NULL;

-- org 依存カラムを削除（customer_org_stats に移行済み）
ALTER TABLE public.customers DROP COLUMN IF EXISTS visit_count;
ALTER TABLE public.customers DROP COLUMN IF EXISTS total_spent;
ALTER TABLE public.customers DROP COLUMN IF EXISTS last_visit;
ALTER TABLE public.customers DROP COLUMN IF EXISTS notes;

-- =============================================================================
-- 4. grant_registration_coupons トリガー修正
--    organization_id = NULL のプラットフォーム顧客はスキップ
--    （クーポンは org 固有なので、org が確定している guest 顧客のみ対象）
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_registration_coupons()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campaign              RECORD;
  v_expires_at            TIMESTAMPTZ;
  v_existing_coupon_count INTEGER;
BEGIN
  -- プラットフォーム顧客（organization_id IS NULL）はスキップ
  -- クーポン付与は org 固有なので、guest 顧客（organization_id IS NOT NULL）のみ対象
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- メールアドレスがない場合はスキップ
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  FOR v_campaign IN
    SELECT *
    FROM public.coupon_campaigns
    WHERE trigger_type = 'registration'
      AND is_active = true
      AND (valid_from IS NULL OR valid_from <= now())
      AND (valid_until IS NULL OR valid_until >= now())
      AND organization_id = NEW.organization_id
  LOOP
    SELECT COUNT(*) INTO v_existing_coupon_count
    FROM public.customer_coupons cc
    INNER JOIN public.customers c ON c.id = cc.customer_id
    WHERE cc.campaign_id = v_campaign.id
      AND c.id <> NEW.id
      AND NEW.email IS NOT NULL
      AND NEW.email <> ''
      AND c.email = NEW.email;

    IF v_existing_coupon_count > 0 THEN
      RAISE NOTICE 'クーポン付与スキップ: メール % は既にキャンペーン % のクーポンを所持', NEW.email, v_campaign.name;
      CONTINUE;
    END IF;

    IF v_campaign.coupon_expiry_days IS NOT NULL THEN
      v_expires_at := now() + (v_campaign.coupon_expiry_days || ' days')::INTERVAL;
    ELSE
      v_expires_at := NULL;
    END IF;

    INSERT INTO public.customer_coupons (
      campaign_id, customer_id, organization_id, uses_remaining, expires_at, status
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

-- =============================================================================
-- 5. customers RLS ポリシー全面書き直し
-- =============================================================================

-- 既存ポリシーを全削除
DROP POLICY IF EXISTS "customers_delete_admin"            ON public.customers;
DROP POLICY IF EXISTS "customers_delete_admin_org"        ON public.customers;
DROP POLICY IF EXISTS "customers_insert_staff_or_admin_org" ON public.customers;
DROP POLICY IF EXISTS "customers_select_self_or_admin"    ON public.customers;
DROP POLICY IF EXISTS "customers_select_staff_or_admin_org" ON public.customers;
DROP POLICY IF EXISTS "customers_update_self_or_admin"    ON public.customers;
DROP POLICY IF EXISTS "customers_update_staff_or_admin_org" ON public.customers;

-- SELECT
-- ① 顧客本人は自分のレコードを常に参照可
-- ② ゲスト顧客: 同じ org の staff/admin
-- ③ プラットフォーム顧客: reservations または private_groups 経由で接点がある org の staff/admin
-- ④ license_admin は全顧客を参照可
CREATE POLICY "customers_select"
ON public.customers FOR SELECT
USING (
  -- ① 本人
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  -- ④ license_admin
  public.is_license_admin()
  OR
  (
    public.is_staff_or_admin()
    AND (
      -- ② ゲスト顧客
      (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
      OR
      -- ③ プラットフォーム顧客（接点チェック）
      (
        organization_id IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.customer_id = customers.id
              AND r.organization_id = public.get_user_organization_id()
          )
          OR EXISTS (
            SELECT 1
            FROM public.private_groups pg
            JOIN public.private_group_members pgm ON pgm.group_id = pg.id
            WHERE customers.user_id IS NOT NULL
              AND pgm.user_id = customers.user_id
              AND pg.organization_id = public.get_user_organization_id()
          )
        )
      )
    )
  )
);

-- INSERT
-- ① staff/admin がゲスト顧客を作成（organization_id 必須）
-- ② ログイン済み顧客が自分のレコードを作成（Phase 3 完了まで organization_id の有無は問わない）
CREATE POLICY "customers_insert"
ON public.customers FOR INSERT
WITH CHECK (
  (public.is_staff_or_admin() AND organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
  OR
  (user_id IS NOT NULL AND user_id = auth.uid())
);

-- UPDATE
-- ① 本人は自分のレコードを更新可
-- ② ゲスト顧客: 同じ org の staff/admin
-- ③ プラットフォーム顧客: 接点がある org の staff/admin
-- ④ license_admin
CREATE POLICY "customers_update"
ON public.customers FOR UPDATE
USING (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  public.is_license_admin()
  OR
  (
    public.is_staff_or_admin()
    AND (
      (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
      OR
      (
        organization_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.reservations r
          WHERE r.customer_id = customers.id
            AND r.organization_id = public.get_user_organization_id()
        )
      )
    )
  )
)
WITH CHECK (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  public.is_license_admin()
  OR
  (
    public.is_staff_or_admin()
    AND (
      (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
      OR
      (
        organization_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.reservations r
          WHERE r.customer_id = customers.id
            AND r.organization_id = public.get_user_organization_id()
        )
      )
    )
  )
);

-- DELETE
-- ゲスト顧客: 同じ org の admin のみ
-- プラットフォーム顧客: license_admin のみ（本人削除は delete-my-account Edge Function 経由）
CREATE POLICY "customers_delete"
ON public.customers FOR DELETE
USING (
  (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id() AND public.is_admin())
  OR
  public.is_license_admin()
);

-- =============================================================================
-- 6. customer_org_stats RLS ポリシー
-- =============================================================================

CREATE POLICY "customer_org_stats_select"
ON public.customer_org_stats FOR SELECT
USING (
  -- 同じ org の staff/admin
  (organization_id = public.get_user_organization_id() AND public.is_staff_or_admin())
  OR
  -- 顧客本人（自分の全 org stats を参照可）
  customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
  OR
  public.is_license_admin()
);

CREATE POLICY "customer_org_stats_insert"
ON public.customer_org_stats FOR INSERT
WITH CHECK (
  (organization_id = public.get_user_organization_id() AND public.is_staff_or_admin())
  OR
  public.is_license_admin()
);

CREATE POLICY "customer_org_stats_update"
ON public.customer_org_stats FOR UPDATE
USING (
  (organization_id = public.get_user_organization_id() AND public.is_staff_or_admin())
  OR
  public.is_license_admin()
)
WITH CHECK (
  (organization_id = public.get_user_organization_id() AND public.is_staff_or_admin())
  OR
  public.is_license_admin()
);

CREATE POLICY "customer_org_stats_delete"
ON public.customer_org_stats FOR DELETE
USING (
  (organization_id = public.get_user_organization_id() AND public.is_admin())
  OR
  public.is_license_admin()
);

-- =============================================================================
-- 7. updated_at 自動更新トリガー（customer_org_stats）
-- =============================================================================

CREATE TRIGGER set_customer_org_stats_updated_at
  BEFORE UPDATE ON public.customer_org_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
