-- =============================================================================
-- Organization RLS ポリシー追加
-- =============================================================================
-- 
-- 【目的】
-- マルチテナント対応のため、organization_idベースのRLSフィルタリングを追加。
-- 各組織は自分の組織のデータのみアクセス可能にする。
-- 
-- 【重要】
-- - 予約サイト（顧客向け）は匿名ユーザーでもアクセス可能（SELECTのみ）
-- - 管理画面（スタッフ向け）は自分の組織のデータのみ表示
-- - 共有シナリオ（is_shared=true）は全組織からアクセス可能
-- 
-- 【適用前に確認】
-- 1. 全てのテーブルにorganization_idカラムが存在すること
-- 2. 既存データにorganization_idが設定されていること
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ヘルパー関数: 現在のユーザーの組織IDを取得
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY INVOKER;

-- -----------------------------------------------------------------------------
-- ヘルパー関数: 指定した組織に所属しているか
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.belongs_to_organization(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT organization_id = org_id FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER;

-- =============================================================================
-- 既存ポリシーの削除と新ポリシーの追加
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. stores（店舗情報）
-- 読み取り：全員可能（予約サイト用）
-- 書き込み：自分の組織のデータのみ
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- 既存ポリシーを削除
  DROP POLICY IF EXISTS "stores_select_all" ON public.stores;
  DROP POLICY IF EXISTS "stores_insert_admin" ON public.stores;
  DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
  DROP POLICY IF EXISTS "stores_delete_admin" ON public.stores;
  
  -- 新ポリシーを作成
  -- SELECT: 顧客/匿名は全て可能、スタッフは自分の組織のみ
  CREATE POLICY "stores_select_org_or_anon" ON public.stores
    FOR SELECT
    USING (
      -- 顧客/匿名（組織に所属しないユーザー）は全て見える
      get_user_organization_id() IS NULL OR
      -- スタッフは自分の組織のデータのみ
      organization_id = get_user_organization_id()
    );
  
  -- INSERT: 自分の組織のデータのみ作成可能
  CREATE POLICY "stores_insert_own_org" ON public.stores
    FOR INSERT
    WITH CHECK (
      is_admin() AND 
      (organization_id = get_user_organization_id() OR organization_id IS NULL)
    );
  
  -- UPDATE: 自分の組織のデータのみ更新可能
  CREATE POLICY "stores_update_own_org" ON public.stores
    FOR UPDATE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id()
    );
  
  -- DELETE: 自分の組織のデータのみ削除可能
  CREATE POLICY "stores_delete_own_org" ON public.stores
    FOR DELETE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id()
    );
END $$;

-- -----------------------------------------------------------------------------
-- 2. scenarios（シナリオ情報）
-- 読み取り：全員可能（予約サイト用）
-- 書き込み：自分の組織のデータのみ（共有シナリオは特別扱い）
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- 既存ポリシーを削除
  DROP POLICY IF EXISTS "scenarios_select_all" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_insert_admin" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_update_admin" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_delete_admin" ON public.scenarios;
  
  -- 新ポリシーを作成
  -- SELECT: 顧客/匿名は全て可能、スタッフは自分の組織+共有シナリオ
  CREATE POLICY "scenarios_select_org_or_anon" ON public.scenarios
    FOR SELECT
    USING (
      -- 顧客/匿名（組織に所属しないユーザー）は全て見える
      get_user_organization_id() IS NULL OR
      -- スタッフは自分の組織のデータまたは共有シナリオ
      organization_id = get_user_organization_id() OR
      is_shared = true
    );
  
  -- INSERT: 自分の組織のデータのみ作成可能
  CREATE POLICY "scenarios_insert_own_org" ON public.scenarios
    FOR INSERT
    WITH CHECK (
      is_admin() AND 
      (organization_id = get_user_organization_id() OR organization_id IS NULL)
    );
  
  -- UPDATE: 自分の組織のデータ、または共有シナリオ（is_shared=true）のみ更新可能
  CREATE POLICY "scenarios_update_own_org" ON public.scenarios
    FOR UPDATE
    USING (
      is_admin() AND 
      (organization_id = get_user_organization_id() OR is_shared = true)
    );
  
  -- DELETE: 自分の組織のデータのみ削除可能（共有シナリオは削除不可）
  CREATE POLICY "scenarios_delete_own_org" ON public.scenarios
    FOR DELETE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id() AND
      (is_shared IS NULL OR is_shared = false)
    );
END $$;

-- -----------------------------------------------------------------------------
-- 3. schedule_events（公演スケジュール）
-- 読み取り：全員可能（予約サイト用）
-- 書き込み：自分の組織のデータのみ
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- 既存ポリシーを削除
  DROP POLICY IF EXISTS "schedule_events_select_all" ON public.schedule_events;
  DROP POLICY IF EXISTS "schedule_events_insert_staff_or_admin" ON public.schedule_events;
  DROP POLICY IF EXISTS "schedule_events_update_staff_or_admin" ON public.schedule_events;
  DROP POLICY IF EXISTS "schedule_events_delete_staff_or_admin" ON public.schedule_events;
  
  -- 新ポリシーを作成
  -- SELECT: 顧客/匿名は全て可能、スタッフは自分の組織のみ
  CREATE POLICY "schedule_events_select_org_or_anon" ON public.schedule_events
    FOR SELECT
    USING (
      -- 顧客/匿名（組織に所属しないユーザー）は全て見える
      get_user_organization_id() IS NULL OR
      -- スタッフは自分の組織のデータのみ
      organization_id = get_user_organization_id()
    );
  
  -- INSERT: 自分の組織のデータのみ作成可能
  CREATE POLICY "schedule_events_insert_own_org" ON public.schedule_events
    FOR INSERT
    WITH CHECK (
      is_staff_or_admin() AND 
      (organization_id = get_user_organization_id() OR organization_id IS NULL)
    );
  
  -- UPDATE: 自分の組織のデータのみ更新可能
  CREATE POLICY "schedule_events_update_own_org" ON public.schedule_events
    FOR UPDATE
    USING (
      is_staff_or_admin() AND 
      organization_id = get_user_organization_id()
    );
  
  -- DELETE: 自分の組織のデータのみ削除可能
  CREATE POLICY "schedule_events_delete_own_org" ON public.schedule_events
    FOR DELETE
    USING (
      is_staff_or_admin() AND 
      organization_id = get_user_organization_id()
    );
END $$;

-- -----------------------------------------------------------------------------
-- 4. staff（スタッフ情報）
-- 読み取り：全員可能（GM名表示用）
-- 書き込み：自分の組織のデータのみ
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- 既存ポリシーを削除
  DROP POLICY IF EXISTS "staff_select_all" ON public.staff;
  DROP POLICY IF EXISTS "staff_insert_admin" ON public.staff;
  DROP POLICY IF EXISTS "staff_update_self_or_admin" ON public.staff;
  DROP POLICY IF EXISTS "staff_delete_admin" ON public.staff;
  
  -- 新ポリシーを作成
  -- SELECT: 顧客/匿名は全て可能、スタッフは自分の組織のみ
  CREATE POLICY "staff_select_org_or_anon" ON public.staff
    FOR SELECT
    USING (
      -- 顧客/匿名（組織に所属しないユーザー）は全て見える
      get_user_organization_id() IS NULL OR
      -- スタッフは自分の組織のデータのみ
      organization_id = get_user_organization_id()
    );
  
  -- INSERT: 自分の組織のデータのみ作成可能
  CREATE POLICY "staff_insert_own_org" ON public.staff
    FOR INSERT
    WITH CHECK (
      is_admin() AND 
      (organization_id = get_user_organization_id() OR organization_id IS NULL)
    );
  
  -- UPDATE: 自分自身 または 自分の組織のデータのみ更新可能
  CREATE POLICY "staff_update_own_org" ON public.staff
    FOR UPDATE
    USING (
      user_id = auth.uid() OR
      (is_admin() AND organization_id = get_user_organization_id())
    );
  
  -- DELETE: 自分の組織のデータのみ削除可能
  CREATE POLICY "staff_delete_own_org" ON public.staff
    FOR DELETE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id()
    );
END $$;

-- -----------------------------------------------------------------------------
-- 5. reservations（予約情報）
-- 読み取り：自分の予約 または 自分の組織のデータ
-- 書き込み：自分の予約 または 自分の組織のデータ
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- 既存ポリシーを削除
  DROP POLICY IF EXISTS "reservations_select_self_or_admin" ON public.reservations;
  DROP POLICY IF EXISTS "reservations_insert_self_or_admin" ON public.reservations;
  DROP POLICY IF EXISTS "reservations_update_admin" ON public.reservations;
  DROP POLICY IF EXISTS "reservations_delete_admin" ON public.reservations;
  
  -- 新ポリシーを作成
  -- SELECT: 自分の予約 または 自分の組織のデータ
  CREATE POLICY "reservations_select_self_or_own_org" ON public.reservations
    FOR SELECT
    USING (
      -- 自分の予約
      customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()) OR
      -- 自分の組織のデータ（管理者）
      (is_admin() AND organization_id = get_user_organization_id())
    );
  
  -- INSERT: 自分の予約 または 自分の組織のデータ
  CREATE POLICY "reservations_insert_self_or_own_org" ON public.reservations
    FOR INSERT
    WITH CHECK (
      customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()) OR
      customer_id IS NULL OR
      (is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL))
    );
  
  -- UPDATE: 自分の組織のデータのみ
  CREATE POLICY "reservations_update_own_org" ON public.reservations
    FOR UPDATE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id()
    );
  
  -- DELETE: 自分の組織のデータのみ
  CREATE POLICY "reservations_delete_own_org" ON public.reservations
    FOR DELETE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id()
    );
END $$;

-- -----------------------------------------------------------------------------
-- 6. customers（顧客情報）
-- 読み取り：自分自身 または 自分の組織のデータ
-- 書き込み：自分自身 または 自分の組織のデータ
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  -- 既存ポリシーを削除
  DROP POLICY IF EXISTS "customers_select_self_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "customers_insert_self_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "customers_update_self_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "customers_delete_admin" ON public.customers;
  
  -- 新ポリシーを作成
  -- SELECT: 自分自身 または 自分の組織のデータ
  CREATE POLICY "customers_select_self_or_own_org" ON public.customers
    FOR SELECT
    USING (
      user_id = auth.uid() OR
      (is_admin() AND organization_id = get_user_organization_id())
    );
  
  -- INSERT: 自分自身 または 自分の組織のデータ
  CREATE POLICY "customers_insert_self_or_own_org" ON public.customers
    FOR INSERT
    WITH CHECK (
      user_id = auth.uid() OR
      (is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL))
    );
  
  -- UPDATE: 自分自身 または 自分の組織のデータ
  CREATE POLICY "customers_update_self_or_own_org" ON public.customers
    FOR UPDATE
    USING (
      user_id = auth.uid() OR
      (is_admin() AND organization_id = get_user_organization_id())
    );
  
  -- DELETE: 自分の組織のデータのみ
  CREATE POLICY "customers_delete_own_org" ON public.customers
    FOR DELETE
    USING (
      is_admin() AND 
      organization_id = get_user_organization_id()
    );
END $$;

-- -----------------------------------------------------------------------------
-- コメント
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION public.get_user_organization_id IS '現在のユーザーの組織IDを取得する関数';
COMMENT ON FUNCTION public.belongs_to_organization IS '指定した組織に所属しているかを判定する関数';

-- =============================================================================
-- 完了
-- =============================================================================
-- 
-- 【適用後の確認事項】
-- 1. 予約サイトから各組織のデータが正しく表示されること
-- 2. 管理画面から他組織のデータが見えないこと
-- 3. 共有シナリオが全組織から見えること
-- 
-- =============================================================================

