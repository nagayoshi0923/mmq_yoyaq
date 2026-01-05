-- ============================================================
-- シナリオマスターテーブル（プラットフォームレベル）
-- Phase 1: 新テーブル追加（既存scenariosテーブルに影響なし）
-- ============================================================

-- 1. シナリオマスターテーブル（共通情報）
CREATE TABLE IF NOT EXISTS public.scenario_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本情報（プラットフォーム共通）
  title text NOT NULL,
  slug text UNIQUE,
  key_visual_url text,
  
  -- ゲーム情報
  author text,                          -- 制作者
  player_count_min integer NOT NULL DEFAULT 1,
  player_count_max integer NOT NULL DEFAULT 10,
  duration integer NOT NULL DEFAULT 180,  -- 分単位
  extra_preparation_time integer DEFAULT 0,  -- 追加準備時間
  genre text[] DEFAULT '{}',
  difficulty integer,                   -- 難易度 1-5
  
  -- 説明
  description text,
  short_description text,
  
  -- メタ情報
  release_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. 組織×シナリオ紐付けテーブル（組織固有情報）
CREATE TABLE IF NOT EXISTS public.organization_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_master_id uuid NOT NULL REFERENCES public.scenario_masters(id) ON DELETE CASCADE,
  
  -- 組織固有の情報
  participation_fee integer,            -- 参加費（組織ごとに異なる可能性）
  license_fee integer,                  -- ライセンス料
  license_type text,                    -- ライセンス種別
  
  -- ステータス（組織ごとに管理）
  status text DEFAULT 'available',      -- available, unavailable, coming_soon
  scenario_type text DEFAULT 'normal',  -- normal, gm_test, etc.
  is_featured boolean DEFAULT false,    -- おすすめ表示
  
  -- 店舗制限（組織内でどの店舗で開催可能か）
  available_stores text[],
  
  -- タイムスタンプ
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- 同じ組織で同じシナリオは1つだけ
  UNIQUE(organization_id, scenario_master_id)
);

-- 3. 組織テーブルにlogo_urlカラム追加
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.organizations.logo_url IS '組織のロゴ画像URL';

-- 4. インデックス
CREATE INDEX IF NOT EXISTS idx_scenario_masters_slug ON public.scenario_masters(slug);
CREATE INDEX IF NOT EXISTS idx_scenario_masters_title ON public.scenario_masters(title);
CREATE INDEX IF NOT EXISTS idx_organization_scenarios_org ON public.organization_scenarios(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_scenarios_master ON public.organization_scenarios(scenario_master_id);
CREATE INDEX IF NOT EXISTS idx_organization_scenarios_status ON public.organization_scenarios(status);

-- 5. RLSポリシー
ALTER TABLE public.scenario_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_scenarios ENABLE ROW LEVEL SECURITY;

-- scenario_masters: 誰でも読める（公開情報）
CREATE POLICY "scenario_masters_select_all" ON public.scenario_masters
  FOR SELECT USING (true);

-- scenario_masters: 管理者のみ書き込み可能
CREATE POLICY "scenario_masters_insert_admin" ON public.scenario_masters
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "scenario_masters_update_admin" ON public.scenario_masters
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- organization_scenarios: 自組織のデータのみ読み書き可能
CREATE POLICY "organization_scenarios_select" ON public.organization_scenarios
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "organization_scenarios_insert" ON public.organization_scenarios
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "organization_scenarios_update" ON public.organization_scenarios
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 6. コメント
COMMENT ON TABLE public.scenario_masters IS 'シナリオマスター（プラットフォーム共通の基本情報）';
COMMENT ON TABLE public.organization_scenarios IS '組織×シナリオ紐付け（組織固有の参加費・ステータス等）';

-- ============================================================
-- Phase 2用: 既存データ移行スクリプト（別途実行）
-- ============================================================
-- 以下は移行時に実行するSQL（今は実行しない）
/*
-- 既存scenariosからscenario_mastersへデータ移行
INSERT INTO scenario_masters (
  id, title, slug, key_visual_url, author,
  player_count_min, player_count_max, duration, extra_preparation_time,
  genre, difficulty, description, short_description, release_date
)
SELECT DISTINCT ON (title)
  id, title, slug, key_visual_url, author,
  player_count_min, player_count_max, duration, extra_preparation_time,
  genre, difficulty, description, short_description, release_date
FROM scenarios
ORDER BY title, created_at;

-- 既存scenariosからorganization_scenariosへデータ移行
INSERT INTO organization_scenarios (
  organization_id, scenario_master_id,
  participation_fee, license_fee, license_type,
  status, scenario_type, available_stores
)
SELECT 
  organization_id,
  id, -- 同じIDを使用（移行時のみ）
  participation_fee,
  NULL, -- license_feeは後で設定
  NULL, -- license_typeは後で設定
  status,
  scenario_type,
  available_stores
FROM scenarios
WHERE organization_id IS NOT NULL;
*/

