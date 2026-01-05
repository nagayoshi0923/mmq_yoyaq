-- シナリオマスタ設計 マイグレーション
-- 作成日: 2026-01-05
-- 概要: シナリオを2層構造に分離（MMQ共通マスタ + 組織ごとの設定）

-- ============================================================
-- 0. 既存テーブルを削除（クリーンスタート）
-- ============================================================
-- 注意: 本番環境では実行しないでください（データが消えます）
DROP VIEW IF EXISTS public.organization_scenarios_with_master CASCADE;
DROP TABLE IF EXISTS public.organization_scenarios CASCADE;
DROP TABLE IF EXISTS public.scenario_masters CASCADE;

-- ============================================================
-- 1. ヘルパー関数（なければ作成）
-- ============================================================

-- スタッフまたは管理者かどうかを判定する関数
CREATE OR REPLACE FUNCTION is_staff_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'staff', 'license_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ライセンス管理者かどうかを判定する関数
CREATE OR REPLACE FUNCTION is_license_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'license_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 1. scenario_masters テーブル（MMQ共通シナリオマスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scenario_masters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 基本情報
  title TEXT NOT NULL,
  author TEXT,
  author_id UUID REFERENCES public.authors(id) ON DELETE SET NULL,
  key_visual_url TEXT,
  description TEXT,
  
  -- ゲーム設定
  player_count_min INTEGER NOT NULL DEFAULT 4,
  player_count_max INTEGER NOT NULL DEFAULT 6,
  official_duration INTEGER NOT NULL DEFAULT 180,  -- 公式目安時間（分）
  genre TEXT[] DEFAULT '{}',
  difficulty TEXT,  -- 'beginner', 'intermediate', 'advanced'
  
  -- 追加情報
  synopsis TEXT,  -- あらすじ
  caution TEXT,   -- 注意事項
  required_items TEXT[],  -- 必要道具
  
  -- 承認フロー
  master_status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (master_status IN ('draft', 'pending', 'approved', 'rejected')),
  submitted_by_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- メタ情報
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_scenario_masters_status ON public.scenario_masters(master_status);
CREATE INDEX IF NOT EXISTS idx_scenario_masters_title ON public.scenario_masters(title);
CREATE INDEX IF NOT EXISTS idx_scenario_masters_author ON public.scenario_masters(author);
CREATE INDEX IF NOT EXISTS idx_scenario_masters_submitted_by ON public.scenario_masters(submitted_by_organization_id);

-- コメント
COMMENT ON TABLE public.scenario_masters IS 'MMQ共通シナリオマスタ - プラットフォーム全体で共有されるシナリオ情報';
COMMENT ON COLUMN public.scenario_masters.master_status IS 'draft: 下書き, pending: 承認待ち, approved: 承認済み, rejected: 却下';
COMMENT ON COLUMN public.scenario_masters.official_duration IS '公式の目安公演時間（分）。各組織は独自の時間を設定可能';

-- ============================================================
-- 2. organization_scenarios テーブル（組織ごとのシナリオ設定）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE CASCADE,
  
  -- 組織内識別
  slug TEXT,  -- 組織内でのURL用スラッグ
  
  -- 組織固有の設定（NULLならマスタの値を使用）
  duration INTEGER,  -- 組織独自の公演時間
  participation_fee INTEGER,  -- 参加費
  extra_preparation_time INTEGER DEFAULT 0,  -- 追加準備時間
  
  -- 組織内での公開状態
  org_status TEXT NOT NULL DEFAULT 'available'
    CHECK (org_status IN ('available', 'unavailable', 'coming_soon')),
  
  -- 組織独自のカスタマイズ
  custom_key_visual_url TEXT,
  custom_description TEXT,
  custom_synopsis TEXT,
  custom_caution TEXT,
  
  -- 料金パターン（JSONB）
  pricing_patterns JSONB DEFAULT '[]',
  
  -- GM設定（JSONB）
  gm_assignments JSONB DEFAULT '[]',
  
  -- メタ情報
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- ユニーク制約：同じ組織で同じシナリオマスタは1つだけ
  UNIQUE(organization_id, scenario_master_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_org_scenarios_org_id ON public.organization_scenarios(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_scenarios_master_id ON public.organization_scenarios(scenario_master_id);
CREATE INDEX IF NOT EXISTS idx_org_scenarios_slug ON public.organization_scenarios(organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_org_scenarios_status ON public.organization_scenarios(org_status);

-- コメント
COMMENT ON TABLE public.organization_scenarios IS '組織ごとのシナリオ設定 - マスタを参照し、組織固有の設定を追加';
COMMENT ON COLUMN public.organization_scenarios.duration IS '組織独自の公演時間。NULLならscenario_masters.official_durationを使用';
COMMENT ON COLUMN public.organization_scenarios.org_status IS 'available: 公開中, unavailable: 非公開, coming_soon: 近日公開';

-- ============================================================
-- 3. RLSポリシー
-- ============================================================

-- scenario_masters
ALTER TABLE public.scenario_masters ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除（再実行可能にするため）
DROP POLICY IF EXISTS "scenario_masters_select" ON public.scenario_masters;
DROP POLICY IF EXISTS "scenario_masters_insert" ON public.scenario_masters;
DROP POLICY IF EXISTS "scenario_masters_update" ON public.scenario_masters;
DROP POLICY IF EXISTS "scenario_masters_delete" ON public.scenario_masters;

-- 閲覧: 全員が閲覧可能（ただしdraftは作成組織 or MMQ運営のみ）
CREATE POLICY "scenario_masters_select" ON public.scenario_masters
  FOR SELECT
  USING (
    master_status IN ('pending', 'approved', 'rejected')
    OR submitted_by_organization_id = get_user_organization_id()
    OR is_license_admin()
  );

-- 作成: 認証済みユーザー（スタッフ以上）
CREATE POLICY "scenario_masters_insert" ON public.scenario_masters
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_staff_or_admin()
  );

-- 更新: 自組織が申請したもの or MMQ運営者
CREATE POLICY "scenario_masters_update" ON public.scenario_masters
  FOR UPDATE
  USING (
    submitted_by_organization_id = get_user_organization_id()
    OR is_license_admin()
  );

-- 削除: MMQ運営者のみ
CREATE POLICY "scenario_masters_delete" ON public.scenario_masters
  FOR DELETE
  USING (
    is_license_admin()
  );

-- organization_scenarios
ALTER TABLE public.organization_scenarios ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "org_scenarios_select" ON public.organization_scenarios;
DROP POLICY IF EXISTS "org_scenarios_insert" ON public.organization_scenarios;
DROP POLICY IF EXISTS "org_scenarios_update" ON public.organization_scenarios;
DROP POLICY IF EXISTS "org_scenarios_delete" ON public.organization_scenarios;

-- 閲覧: 匿名ユーザーも閲覧可能（予約サイト用）
CREATE POLICY "org_scenarios_select" ON public.organization_scenarios
  FOR SELECT
  USING (true);

-- 作成: 自組織のみ
CREATE POLICY "org_scenarios_insert" ON public.organization_scenarios
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    OR is_license_admin()
  );

-- 更新: 自組織 or MMQ運営者
CREATE POLICY "org_scenarios_update" ON public.organization_scenarios
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    OR is_license_admin()
  );

-- 削除: 自組織 or MMQ運営者
CREATE POLICY "org_scenarios_delete" ON public.organization_scenarios
  FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    OR is_license_admin()
  );

-- ============================================================
-- 4. トリガー（updated_at自動更新）
-- ============================================================

-- scenario_masters
CREATE OR REPLACE FUNCTION update_scenario_masters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scenario_masters_updated_at ON public.scenario_masters;
CREATE TRIGGER trigger_scenario_masters_updated_at
  BEFORE UPDATE ON public.scenario_masters
  FOR EACH ROW
  EXECUTE FUNCTION update_scenario_masters_updated_at();

-- organization_scenarios
CREATE OR REPLACE FUNCTION update_org_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_scenarios_updated_at ON public.organization_scenarios;
CREATE TRIGGER trigger_org_scenarios_updated_at
  BEFORE UPDATE ON public.organization_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_org_scenarios_updated_at();

-- ============================================================
-- 5. ビュー（組織シナリオとマスタを結合）
-- ============================================================

CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
SELECT
  os.id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status,
  os.pricing_patterns,
  os.gm_assignments,
  os.created_at,
  os.updated_at,
  
  -- マスタ情報（組織設定があればそちらを優先）
  sm.title,
  sm.author,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  sm.player_count_min,
  sm.player_count_max,
  COALESCE(os.duration, sm.official_duration) AS duration,
  sm.genre,
  sm.difficulty,
  os.participation_fee,
  os.extra_preparation_time,
  
  -- マスタのステータス
  sm.master_status

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。組織固有設定があればそちらを優先';

-- 完了メッセージ
SELECT 'scenario_masters and organization_scenarios created successfully' as result;
