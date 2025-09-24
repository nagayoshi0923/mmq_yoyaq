-- Queens Waltz マーダーミステリー店舗管理システム
-- Supabase テーブル作成スクリプト

-- 1. ユーザー権限システム
CREATE TYPE app_role AS ENUM ('admin','staff','customer');

-- 2. 店舗テーブル
CREATE TABLE stores (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. シナリオテーブル
CREATE TABLE scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT NOT NULL,
  license_amount INTEGER DEFAULT 0,
  duration INTEGER NOT NULL, -- 所要時間（分）
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
  gm_fee INTEGER DEFAULT 0,
  participation_fee INTEGER DEFAULT 0,
  notes TEXT,
  has_pre_reading BOOLEAN DEFAULT false,
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. スタッフテーブル
CREATE TABLE staff (
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
  availability TEXT[] DEFAULT '{}',
  experience INTEGER DEFAULT 0,
  special_scenarios TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on-leave')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. スタッフ⇔シナリオのリレーションテーブル
CREATE TABLE staff_scenario_assignments (
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  PRIMARY KEY (staff_id, scenario_id)
);

-- 6. ユーザーテーブル（Supabase auth.usersの拡張）
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 顧客テーブル
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  line_id TEXT,
  notes TEXT,
  visit_count INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  last_visit DATE,
  preferences TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. スケジュールイベントテーブル
CREATE TABLE schedule_events (
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
  -- 正規化カラム（将来的に移行）
  scenario_id UUID REFERENCES scenarios(id) ON DELETE RESTRICT,
  store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  published BOOLEAN DEFAULT false,
  capacity INTEGER,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 予約テーブル
CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_number TEXT UNIQUE NOT NULL,
  reservation_page_id TEXT,
  title TEXT NOT NULL,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE RESTRICT,
  store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 公演キット/在庫テーブル
CREATE TABLE performance_kits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE RESTRICT,
  scenario_title TEXT NOT NULL,
  kit_number INTEGER NOT NULL,
  condition TEXT NOT NULL DEFAULT 'excellent' CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'damaged')),
  last_used DATE,
  notes TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_stores_status ON stores(status);
CREATE INDEX idx_scenarios_status ON scenarios(status);
CREATE INDEX idx_scenarios_author ON scenarios(author);
CREATE INDEX idx_staff_status ON staff(status);
CREATE INDEX idx_schedule_events_date ON schedule_events(date);
CREATE INDEX idx_schedule_events_venue ON schedule_events(venue);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_datetime ON reservations(requested_datetime);
CREATE INDEX idx_performance_kits_scenario ON performance_kits(scenario_id);

-- RLS (Row Level Security) 設定
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_kits ENABLE ROW LEVEL SECURITY;

-- 基本的なRLSポリシー（管理者・スタッフは全アクセス、顧客は制限）
CREATE POLICY stores_policy ON stores FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

CREATE POLICY scenarios_policy ON scenarios FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

CREATE POLICY staff_policy ON staff FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

CREATE POLICY users_policy ON users FOR ALL USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
);

CREATE POLICY customers_policy ON customers FOR ALL USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

-- トリガー関数：updated_at自動更新
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 各テーブルにupdated_atトリガーを設定
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scenarios_updated_at BEFORE UPDATE ON scenarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_schedule_events_updated_at BEFORE UPDATE ON schedule_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_performance_kits_updated_at BEFORE UPDATE ON performance_kits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
