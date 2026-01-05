-- organization_scenarios テーブルにカラム追加
-- 作成日: 2026-01-05
-- 概要: 組織シナリオ設定に必要な全カラムを追加

-- ============================================================
-- 1. 料金関連
-- ============================================================
ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS participation_costs JSONB DEFAULT '[]';
COMMENT ON COLUMN organization_scenarios.participation_costs IS '時間帯別料金 [{time_slot, amount, type, status}]';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS gm_test_participation_fee INTEGER;
COMMENT ON COLUMN organization_scenarios.gm_test_participation_fee IS 'GMテスト参加費';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS flexible_pricing JSONB;
COMMENT ON COLUMN organization_scenarios.flexible_pricing IS '柔軟料金設定';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS use_flexible_pricing BOOLEAN DEFAULT false;
COMMENT ON COLUMN organization_scenarios.use_flexible_pricing IS '柔軟料金設定を使用するか';

-- ============================================================
-- 2. ライセンス関連
-- ============================================================
ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS license_amount INTEGER;
COMMENT ON COLUMN organization_scenarios.license_amount IS 'ライセンス料';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS gm_test_license_amount INTEGER;
COMMENT ON COLUMN organization_scenarios.gm_test_license_amount IS 'GMテストライセンス料';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS franchise_license_amount INTEGER;
COMMENT ON COLUMN organization_scenarios.franchise_license_amount IS 'FC用ライセンス料';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS franchise_gm_test_license_amount INTEGER;
COMMENT ON COLUMN organization_scenarios.franchise_gm_test_license_amount IS 'FC用GMテストライセンス料';

-- ============================================================
-- 3. GM関連
-- ============================================================
ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS gm_costs JSONB DEFAULT '[]';
COMMENT ON COLUMN organization_scenarios.gm_costs IS 'GM報酬設定 [{role, reward, category, status}]';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS gm_count INTEGER;
COMMENT ON COLUMN organization_scenarios.gm_count IS 'GM配置数';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS available_gms TEXT[] DEFAULT '{}';
COMMENT ON COLUMN organization_scenarios.available_gms IS '担当可能GMのスタッフID配列';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS experienced_staff TEXT[] DEFAULT '{}';
COMMENT ON COLUMN organization_scenarios.experienced_staff IS '経験スタッフID配列';

-- ============================================================
-- 4. 店舗・制作関連
-- ============================================================
ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS available_stores TEXT[] DEFAULT '{}';
COMMENT ON COLUMN organization_scenarios.available_stores IS '公演可能店舗ID配列';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS production_cost INTEGER DEFAULT 0;
COMMENT ON COLUMN organization_scenarios.production_cost IS '制作費合計';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS production_costs JSONB DEFAULT '[]';
COMMENT ON COLUMN organization_scenarios.production_costs IS '制作費詳細 [{item, amount}]';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS depreciation_per_performance INTEGER;
COMMENT ON COLUMN organization_scenarios.depreciation_per_performance IS '1公演あたり償却費';

-- ============================================================
-- 5. その他
-- ============================================================
ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;
COMMENT ON COLUMN organization_scenarios.play_count IS '公演回数';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS notes TEXT;
COMMENT ON COLUMN organization_scenarios.notes IS 'メモ';

-- ============================================================
-- 6. マスタ上書き項目（override_*）
-- ============================================================
ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_title TEXT;
COMMENT ON COLUMN organization_scenarios.override_title IS 'タイトル上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_author TEXT;
COMMENT ON COLUMN organization_scenarios.override_author IS '作者名上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_player_count_min INTEGER;
COMMENT ON COLUMN organization_scenarios.override_player_count_min IS '最小人数上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_player_count_max INTEGER;
COMMENT ON COLUMN organization_scenarios.override_player_count_max IS '最大人数上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_difficulty TEXT;
COMMENT ON COLUMN organization_scenarios.override_difficulty IS '難易度上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_genre TEXT[];
COMMENT ON COLUMN organization_scenarios.override_genre IS 'ジャンル上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_has_pre_reading BOOLEAN;
COMMENT ON COLUMN organization_scenarios.override_has_pre_reading IS '事前読み込み上書き（NULLならマスタ使用）';

ALTER TABLE organization_scenarios 
  ADD COLUMN IF NOT EXISTS override_required_items TEXT[];
COMMENT ON COLUMN organization_scenarios.override_required_items IS '必要道具上書き（NULLならマスタ使用）';

-- ============================================================
-- 7. scenario_masters に不足カラム追加
-- ============================================================
ALTER TABLE scenario_masters 
  ADD COLUMN IF NOT EXISTS author_email TEXT;
COMMENT ON COLUMN scenario_masters.author_email IS '作者メールアドレス（ライセンス連携用）';

ALTER TABLE scenario_masters 
  ADD COLUMN IF NOT EXISTS has_pre_reading BOOLEAN DEFAULT false;
COMMENT ON COLUMN scenario_masters.has_pre_reading IS '事前読み込みが必要か';

ALTER TABLE scenario_masters 
  ADD COLUMN IF NOT EXISTS release_date DATE;
COMMENT ON COLUMN scenario_masters.release_date IS 'リリース日';

ALTER TABLE scenario_masters 
  ADD COLUMN IF NOT EXISTS official_site_url TEXT;
COMMENT ON COLUMN scenario_masters.official_site_url IS '公式サイトURL';

-- ============================================================
-- 8. 修正リクエストテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scenario_master_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE CASCADE,
  requested_by_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- 修正内容
  field_name TEXT NOT NULL,
  current_value TEXT,
  suggested_value TEXT NOT NULL,
  reason TEXT,
  
  -- ステータス
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_master_id 
  ON public.scenario_master_corrections(scenario_master_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status 
  ON public.scenario_master_corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_org_id 
  ON public.scenario_master_corrections(requested_by_organization_id);

-- RLS
ALTER TABLE public.scenario_master_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corrections_select" ON public.scenario_master_corrections;
DROP POLICY IF EXISTS "corrections_insert" ON public.scenario_master_corrections;
DROP POLICY IF EXISTS "corrections_update" ON public.scenario_master_corrections;

-- 閲覧: MMQ運営は全て、それ以外は自組織のみ
CREATE POLICY "corrections_select" ON public.scenario_master_corrections
  FOR SELECT
  USING (
    is_license_admin()
    OR requested_by_organization_id = get_user_organization_id()
  );

-- 作成: スタッフ以上
CREATE POLICY "corrections_insert" ON public.scenario_master_corrections
  FOR INSERT
  WITH CHECK (is_staff_or_admin());

-- 更新: MMQ運営のみ（承認/却下）
CREATE POLICY "corrections_update" ON public.scenario_master_corrections
  FOR UPDATE
  USING (is_license_admin());

COMMENT ON TABLE public.scenario_master_corrections IS 'シナリオマスタ修正リクエスト';

-- ============================================================
-- 完了メッセージ
-- ============================================================
SELECT 'organization_scenarios columns added successfully!' as result;

