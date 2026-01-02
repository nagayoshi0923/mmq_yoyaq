-- =============================================================================
-- 設定テーブルにorganization_idを追加
-- =============================================================================
-- 
-- 【目的】
-- 各種設定テーブルにorganization_idを追加し、マルチテナント対応する。
-- 管理者は自分の組織の設定のみアクセス可能にする。
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. カラム追加（存在しない場合のみ）
-- -----------------------------------------------------------------------------

-- pricing_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pricing_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.pricing_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- notification_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.notification_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- customer_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.customer_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- reservation_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reservation_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.reservation_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- cancellation_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cancellation_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.cancellation_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- email_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.email_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- business_hours_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'business_hours_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.business_hours_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- global_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'global_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.global_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- system_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.system_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- staff_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.staff_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- sales_report_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales_report_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.sales_report_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- performance_schedule_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'performance_schedule_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.performance_schedule_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- data_management_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'data_management_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.data_management_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- booking_notices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_notices' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.booking_notices ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. RLSポリシー更新
-- -----------------------------------------------------------------------------

-- pricing_settings
DROP POLICY IF EXISTS "pricing_settings_select_admin" ON public.pricing_settings;
DROP POLICY IF EXISTS "pricing_settings_select_own_org" ON public.pricing_settings;
CREATE POLICY "pricing_settings_select_own_org" ON public.pricing_settings
  FOR SELECT USING (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

DROP POLICY IF EXISTS "pricing_settings_insert_admin" ON public.pricing_settings;
DROP POLICY IF EXISTS "pricing_settings_insert_own_org" ON public.pricing_settings;
CREATE POLICY "pricing_settings_insert_own_org" ON public.pricing_settings
  FOR INSERT WITH CHECK (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

DROP POLICY IF EXISTS "pricing_settings_update_admin" ON public.pricing_settings;
DROP POLICY IF EXISTS "pricing_settings_update_own_org" ON public.pricing_settings;
CREATE POLICY "pricing_settings_update_own_org" ON public.pricing_settings
  FOR UPDATE USING (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

DROP POLICY IF EXISTS "pricing_settings_delete_admin" ON public.pricing_settings;
DROP POLICY IF EXISTS "pricing_settings_delete_own_org" ON public.pricing_settings;
CREATE POLICY "pricing_settings_delete_own_org" ON public.pricing_settings
  FOR DELETE USING (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

-- notification_settings
DROP POLICY IF EXISTS "notification_settings_select_admin" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_select_own_org" ON public.notification_settings;
CREATE POLICY "notification_settings_select_own_org" ON public.notification_settings
  FOR SELECT USING (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

DROP POLICY IF EXISTS "notification_settings_insert_admin" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_insert_own_org" ON public.notification_settings;
CREATE POLICY "notification_settings_insert_own_org" ON public.notification_settings
  FOR INSERT WITH CHECK (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

DROP POLICY IF EXISTS "notification_settings_update_admin" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_update_own_org" ON public.notification_settings;
CREATE POLICY "notification_settings_update_own_org" ON public.notification_settings
  FOR UPDATE USING (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

DROP POLICY IF EXISTS "notification_settings_delete_admin" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_delete_own_org" ON public.notification_settings;
CREATE POLICY "notification_settings_delete_own_org" ON public.notification_settings
  FOR DELETE USING (
    is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
  );

-- customer_settings (テーブルが存在する場合のみ)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_settings') THEN
    DROP POLICY IF EXISTS "customer_settings_select_admin" ON public.customer_settings;
    DROP POLICY IF EXISTS "customer_settings_select_own_org" ON public.customer_settings;
    CREATE POLICY "customer_settings_select_own_org" ON public.customer_settings
      FOR SELECT USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "customer_settings_insert_admin" ON public.customer_settings;
    DROP POLICY IF EXISTS "customer_settings_insert_own_org" ON public.customer_settings;
    CREATE POLICY "customer_settings_insert_own_org" ON public.customer_settings
      FOR INSERT WITH CHECK (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "customer_settings_update_admin" ON public.customer_settings;
    DROP POLICY IF EXISTS "customer_settings_update_own_org" ON public.customer_settings;
    CREATE POLICY "customer_settings_update_own_org" ON public.customer_settings
      FOR UPDATE USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "customer_settings_delete_admin" ON public.customer_settings;
    DROP POLICY IF EXISTS "customer_settings_delete_own_org" ON public.customer_settings;
    CREATE POLICY "customer_settings_delete_own_org" ON public.customer_settings
      FOR DELETE USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- system_settings RLSポリシー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings') THEN
    DROP POLICY IF EXISTS "system_settings_select_admin" ON public.system_settings;
    DROP POLICY IF EXISTS "system_settings_select_own_org" ON public.system_settings;
    CREATE POLICY "system_settings_select_own_org" ON public.system_settings
      FOR SELECT USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "system_settings_insert_admin" ON public.system_settings;
    DROP POLICY IF EXISTS "system_settings_manage_own_org" ON public.system_settings;
    CREATE POLICY "system_settings_manage_own_org" ON public.system_settings
      FOR ALL USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- staff_settings RLSポリシー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_settings') THEN
    DROP POLICY IF EXISTS "staff_settings_select_admin" ON public.staff_settings;
    DROP POLICY IF EXISTS "staff_settings_select_own_org" ON public.staff_settings;
    CREATE POLICY "staff_settings_select_own_org" ON public.staff_settings
      FOR SELECT USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "staff_settings_insert_admin" ON public.staff_settings;
    DROP POLICY IF EXISTS "staff_settings_manage_own_org" ON public.staff_settings;
    CREATE POLICY "staff_settings_manage_own_org" ON public.staff_settings
      FOR ALL USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- sales_report_settings RLSポリシー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_report_settings') THEN
    DROP POLICY IF EXISTS "sales_report_settings_select_admin" ON public.sales_report_settings;
    DROP POLICY IF EXISTS "sales_report_settings_select_own_org" ON public.sales_report_settings;
    CREATE POLICY "sales_report_settings_select_own_org" ON public.sales_report_settings
      FOR SELECT USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "sales_report_settings_insert_admin" ON public.sales_report_settings;
    DROP POLICY IF EXISTS "sales_report_settings_manage_own_org" ON public.sales_report_settings;
    CREATE POLICY "sales_report_settings_manage_own_org" ON public.sales_report_settings
      FOR ALL USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- performance_schedule_settings RLSポリシー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'performance_schedule_settings') THEN
    DROP POLICY IF EXISTS "performance_schedule_settings_select_admin" ON public.performance_schedule_settings;
    DROP POLICY IF EXISTS "performance_schedule_settings_select_own_org" ON public.performance_schedule_settings;
    CREATE POLICY "performance_schedule_settings_select_own_org" ON public.performance_schedule_settings
      FOR SELECT USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "performance_schedule_settings_insert_admin" ON public.performance_schedule_settings;
    DROP POLICY IF EXISTS "performance_schedule_settings_manage_own_org" ON public.performance_schedule_settings;
    CREATE POLICY "performance_schedule_settings_manage_own_org" ON public.performance_schedule_settings
      FOR ALL USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- data_management_settings RLSポリシー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'data_management_settings') THEN
    DROP POLICY IF EXISTS "data_management_settings_select_admin" ON public.data_management_settings;
    DROP POLICY IF EXISTS "data_management_settings_select_own_org" ON public.data_management_settings;
    CREATE POLICY "data_management_settings_select_own_org" ON public.data_management_settings
      FOR SELECT USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
    
    DROP POLICY IF EXISTS "data_management_settings_insert_admin" ON public.data_management_settings;
    DROP POLICY IF EXISTS "data_management_settings_manage_own_org" ON public.data_management_settings;
    CREATE POLICY "data_management_settings_manage_own_org" ON public.data_management_settings
      FOR ALL USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- booking_notices RLSポリシー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_notices') THEN
    DROP POLICY IF EXISTS "booking_notices_select_admin" ON public.booking_notices;
    DROP POLICY IF EXISTS "booking_notices_select_own_org" ON public.booking_notices;
    -- 顧客向け予約サイトでも閲覧可能にする
    CREATE POLICY "booking_notices_select_own_org" ON public.booking_notices
      FOR SELECT USING (
        organization_id = get_user_organization_id() OR organization_id IS NULL OR TRUE
      );
    
    DROP POLICY IF EXISTS "booking_notices_insert_admin" ON public.booking_notices;
    DROP POLICY IF EXISTS "booking_notices_manage_own_org" ON public.booking_notices;
    CREATE POLICY "booking_notices_manage_own_org" ON public.booking_notices
      FOR ALL USING (
        is_admin() AND (organization_id = get_user_organization_id() OR organization_id IS NULL)
      );
  END IF;
END $$;

-- =============================================================================
-- 完了
-- =============================================================================

