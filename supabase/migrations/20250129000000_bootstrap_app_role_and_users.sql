-- =============================================================================
-- ブートストラップ: app_role 型と users テーブル
-- =============================================================================
-- 20250130000000_fix_staff_invite_flow より前に実行する必要がある
-- database/create_tables.sql の定義をベースに、最小限のスキーマを先行作成
-- =============================================================================

-- 1. app_role 型を作成（既存ならスキップ）
-- license_admin を含める（is_admin() で参照されるため）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('admin', 'staff', 'customer', 'license_admin');
    RAISE NOTICE 'app_role 型を作成しました';
  ELSE
    RAISE NOTICE 'app_role 型は既に存在します';
  END IF;
END
$$;

-- 2. update_updated_at_column 関数（organizations 等のトリガーで使用）
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. organizations テーブル（20251231010000 で参照される）
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro')),
  contact_email TEXT,
  contact_name TEXT,
  is_license_manager BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON public.organizations(is_active);

-- 4. users テーブル（organizations の RLS が users を参照するため、先に作成）
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'customer',
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON public.users(organization_id);

-- 5. organizations の RLS とトリガー
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.organizations (id, name, slug, plan, is_license_manager, is_active, notes)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'クインズワルツ',
  'queens-waltz',
  'pro',
  true,
  true,
  '初期組織（システム管理者）'
)
ON CONFLICT (slug) DO NOTHING;

DROP POLICY IF EXISTS organizations_select_policy ON public.organizations;
CREATE POLICY organizations_select_policy ON public.organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid())
  );

DROP POLICY IF EXISTS organizations_admin_policy ON public.organizations;
CREATE POLICY organizations_admin_policy ON public.organizations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- 6. ヘルパー関数（organization_settings 等の RLS で使用）
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'staff', 'license_admin') FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE;

-- 7. 基本テーブル（database/create_tables.sql から、organization_id 付き）
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  address TEXT,
  phone_number TEXT,
  email TEXT,
  opening_date DATE,
  manager_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'temporarily_closed', 'closed')),
  capacity INTEGER NOT NULL DEFAULT 0,
  rooms INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  organization_id UUID REFERENCES public.organizations(id),
  region TEXT,
  is_temporary BOOLEAN DEFAULT false,
  ownership_type TEXT,
  fixed_costs JSONB DEFAULT '[]'::jsonb,
  franchise_fee INTEGER DEFAULT 1000,
  temporary_date DATE,
  temporary_dates JSONB DEFAULT '[]'::jsonb,
  temporary_venue_names JSONB DEFAULT '{}'::jsonb,
  transport_allowance INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT NOT NULL,
  license_amount INTEGER DEFAULT 0,
  duration INTEGER NOT NULL,
  player_count_min INTEGER NOT NULL DEFAULT 1,
  player_count_max INTEGER NOT NULL DEFAULT 8,
  difficulty INTEGER DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  available_gms TEXT[] DEFAULT '{}',
  rating DECIMAL(2,1) DEFAULT 0.0 CHECK (rating BETWEEN 0.0 AND 5.0),
  play_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'retired')),
  required_props TEXT[] DEFAULT '{}',
  props JSONB DEFAULT '[]',
  genre TEXT[] DEFAULT '{}',
  production_cost INTEGER DEFAULT 0,
  production_cost_items JSONB DEFAULT '[]',
  production_costs JSONB DEFAULT '[]'::jsonb,
  slug TEXT,
  key_visual_url TEXT,
  scenario_type TEXT DEFAULT 'normal',
  gm_fee INTEGER DEFAULT 0,
  participation_fee INTEGER DEFAULT 0,
  notes TEXT,
  has_pre_reading BOOLEAN DEFAULT false,
  release_date DATE,
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_slug ON public.scenarios(slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  line_name TEXT,
  x_account TEXT,
  role TEXT[] DEFAULT '{}',
  stores TEXT[] DEFAULT '{}',
  ng_days TEXT[] DEFAULT '{}',
  want_to_learn TEXT[] DEFAULT '{}',
  available_scenarios TEXT[] DEFAULT '{}',
  notes TEXT,
  phone TEXT,
  email TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  avatar_url TEXT,
  avatar_color TEXT DEFAULT '#3B82F6',
  discord_channel_id TEXT,
  availability TEXT[] DEFAULT '{}',
  experience INTEGER DEFAULT 0,
  special_scenarios TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on-leave')),
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_scenario_assignments (
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES public.scenarios(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  PRIMARY KEY (staff_id, scenario_id)
);

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  line_id TEXT,
  email TEXT,
  email_verified BOOLEAN DEFAULT false,
  nickname VARCHAR(100),
  address TEXT,
  avatar_url TEXT,
  notes TEXT,
  visit_count INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  last_visit DATE,
  preferences TEXT[] DEFAULT '{}',
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.schedule_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  venue TEXT NOT NULL,
  scenario TEXT NOT NULL,
  gms TEXT[] DEFAULT '{}',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  category TEXT NOT NULL DEFAULT 'open' CHECK (category IN ('open', 'private', 'gmtest', 'testplay', 'offsite')),
  reservation_info TEXT,
  notes TEXT,
  is_cancelled BOOLEAN DEFAULT false,
  scenario_id UUID REFERENCES public.scenarios(id) ON DELETE RESTRICT,
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  published BOOLEAN DEFAULT false,
  capacity INTEGER,
  status TEXT DEFAULT 'scheduled',
  organization_id UUID REFERENCES public.organizations(id),
  reservation_deadline_hours INTEGER DEFAULT 0,
  current_participants INTEGER DEFAULT 0,
  max_participants INTEGER,
  time_slot TEXT,
  is_reservation_enabled BOOLEAN DEFAULT true,
  reservation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_number TEXT UNIQUE NOT NULL,
  reservation_page_id TEXT,
  title TEXT NOT NULL,
  scenario_id UUID REFERENCES public.scenarios(id) ON DELETE RESTRICT,
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  schedule_event_id UUID REFERENCES public.schedule_events(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  requested_datetime TIMESTAMPTZ NOT NULL,
  actual_datetime TIMESTAMPTZ,
  duration INTEGER NOT NULL,
  participant_count INTEGER NOT NULL DEFAULT 1,
  participant_names TEXT[] DEFAULT '{}',
  assigned_staff TEXT[] DEFAULT '{}',
  gm_staff TEXT,
  base_price INTEGER DEFAULT 0,
  options_price INTEGER DEFAULT 0,
  total_price INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  final_price INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_datetime TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_notes TEXT,
  staff_notes TEXT,
  special_requests TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  external_reservation_id TEXT,
  reservation_source TEXT DEFAULT 'web',
  organization_id UUID REFERENCES public.organizations(id),
  display_customer_name TEXT,
  unit_price INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.performance_kits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID REFERENCES public.scenarios(id) ON DELETE RESTRICT,
  scenario_title TEXT NOT NULL,
  kit_number INTEGER NOT NULL,
  condition TEXT NOT NULL DEFAULT 'excellent' CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'damaged')),
  last_used DATE,
  notes TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_stores_status ON public.stores(status);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON public.scenarios(status);
CREATE INDEX IF NOT EXISTS idx_staff_status ON public.staff(status);
CREATE INDEX IF NOT EXISTS idx_schedule_events_date ON public.schedule_events(date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_schedule_event_id ON public.reservations(schedule_event_id);
CREATE INDEX IF NOT EXISTS idx_performance_kits_scenario ON public.performance_kits(scenario_id);

-- RLS と updated_at トリガー
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_kits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
  CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_scenarios_updated_at ON public.scenarios;
  CREATE TRIGGER update_scenarios_updated_at BEFORE UPDATE ON public.scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_staff_updated_at ON public.staff;
  CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
  CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_schedule_events_updated_at ON public.schedule_events;
  CREATE TRIGGER update_schedule_events_updated_at BEFORE UPDATE ON public.schedule_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_reservations_updated_at ON public.reservations;
  CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_performance_kits_updated_at ON public.performance_kits;
  CREATE TRIGGER update_performance_kits_updated_at BEFORE UPDATE ON public.performance_kits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
END $$;

-- 8. global_settings（20260101020000 が ALTER する前提で基本テーブルのみ作成）
CREATE TABLE IF NOT EXISTS public.global_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_submission_start_day INTEGER DEFAULT 1,
  shift_submission_end_day INTEGER DEFAULT 15,
  shift_submission_target_months_ahead INTEGER DEFAULT 1,
  system_name TEXT DEFAULT 'MMQ 予約管理システム',
  maintenance_mode BOOLEAN DEFAULT false,
  maintenance_message TEXT,
  enable_email_notifications BOOLEAN DEFAULT true,
  enable_discord_notifications BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.global_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.global_settings LIMIT 1);

DROP TRIGGER IF EXISTS update_global_settings_updated_at ON public.global_settings;
CREATE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- 20260101020000 が DROP/CREATE するため、最小限のポリシーを暫定設定
DROP POLICY IF EXISTS "Anyone can read global settings" ON public.global_settings;
CREATE POLICY "Anyone can read global settings" ON public.global_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can update global settings" ON public.global_settings;
CREATE POLICY "Authenticated users can update global settings" ON public.global_settings FOR UPDATE USING (auth.role() = 'authenticated');

-- 9. business_hours_settings（20260102000000 が ALTER する前提で基本テーブルのみ作成）
CREATE TABLE IF NOT EXISTS public.business_hours_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  opening_hours JSONB,
  holidays TEXT[] DEFAULT '{}',
  time_restrictions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

DROP TRIGGER IF EXISTS update_business_hours_settings_updated_at ON public.business_hours_settings;
CREATE TRIGGER update_business_hours_settings_updated_at
  BEFORE UPDATE ON public.business_hours_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.business_hours_settings ENABLE ROW LEVEL SECURITY;

-- 10. 設定テーブル（20260131004000, 20251231020000 が ALTER する前提）
CREATE TABLE IF NOT EXISTS public.store_basic_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  store_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  business_license_number TEXT,
  tax_id TEXT,
  bank_account_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

CREATE TABLE IF NOT EXISTS public.performance_schedule_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  performances_per_day INTEGER DEFAULT 2,
  performance_times JSONB,
  preparation_time INTEGER DEFAULT 30,
  default_duration INTEGER DEFAULT 180,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

CREATE TABLE IF NOT EXISTS public.reservation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  max_participants_per_booking INTEGER DEFAULT 8,
  advance_booking_days INTEGER DEFAULT 90,
  same_day_booking_cutoff INTEGER DEFAULT 0,
  cancellation_policy TEXT,
  cancellation_deadline_hours INTEGER DEFAULT 24,
  max_bookings_per_customer INTEGER,
  require_phone_verification BOOLEAN DEFAULT false,
  cancellation_fees JSONB DEFAULT '[{"hours_before":168,"fee_percentage":0,"description":"1週間前まで無料"},{"hours_before":72,"fee_percentage":30,"description":"3日前まで30%"},{"hours_before":24,"fee_percentage":50,"description":"前日まで50%"},{"hours_before":0,"fee_percentage":100,"description":"当日100%"}]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  base_price INTEGER DEFAULT 3000,
  time_slot_pricing JSONB,
  group_discounts JSONB,
  member_discount INTEGER DEFAULT 0,
  tax_rate DECIMAL(4,2) DEFAULT 10.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_store_basic_settings_updated_at ON public.store_basic_settings;
  CREATE TRIGGER update_store_basic_settings_updated_at BEFORE UPDATE ON public.store_basic_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_performance_schedule_settings_updated_at ON public.performance_schedule_settings;
  CREATE TRIGGER update_performance_schedule_settings_updated_at BEFORE UPDATE ON public.performance_schedule_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_reservation_settings_updated_at ON public.reservation_settings;
  CREATE TRIGGER update_reservation_settings_updated_at BEFORE UPDATE ON public.reservation_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS update_pricing_settings_updated_at ON public.pricing_settings;
  CREATE TRIGGER update_pricing_settings_updated_at BEFORE UPDATE ON public.pricing_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
END $$;

ALTER TABLE public.store_basic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- 11. schedule_event_history（20260113000000 が ALTER する前提）
CREATE TABLE IF NOT EXISTS public.schedule_event_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_event_id UUID REFERENCES public.schedule_events(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  store_id UUID,
  time_slot TEXT,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('create','update','delete','cancel','restore','publish','unpublish')),
  changes JSONB NOT NULL DEFAULT '{}',
  old_values JSONB,
  new_values JSONB,
  deleted_event_scenario TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_event_id ON public.schedule_event_history(schedule_event_id);
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_org_id ON public.schedule_event_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_created_at ON public.schedule_event_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_changed_by ON public.schedule_event_history(changed_by_user_id);
ALTER TABLE public.schedule_event_history ENABLE ROW LEVEL SECURITY;
