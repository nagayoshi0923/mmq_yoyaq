-- マルチテナント対応: 外部公演報告テーブル作成
-- 実行日: 2024-12-17
--
-- 【重要】このマイグレーションは以下の順序で実行すること:
-- 1. 001_create_organizations_table.sql
-- 2. 002_add_organization_id_to_tables.sql
-- 3. 003_create_organization_functions_and_rls.sql
-- 4. このファイル (004_create_external_performance_reports.sql)

-- ================================================
-- 1. 外部公演報告テーブル作成
-- ================================================
CREATE TABLE IF NOT EXISTS external_performance_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 報告対象のシナリオ
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE RESTRICT,
  
  -- 報告元の組織
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  
  -- 報告者（staff）
  reported_by UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  
  -- 公演情報
  performance_date DATE NOT NULL,
  performance_count INTEGER NOT NULL DEFAULT 1 CHECK (performance_count > 0),
  participant_count INTEGER,  -- 参加者数（オプション）
  venue_name TEXT,  -- 公演場所（参考情報）
  
  -- 報告メモ
  notes TEXT,
  
  -- 承認状態
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- 承認者情報（クインズワルツ側のスタッフ）
  reviewed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_external_reports_scenario_id ON external_performance_reports(scenario_id);
CREATE INDEX IF NOT EXISTS idx_external_reports_organization_id ON external_performance_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_external_reports_status ON external_performance_reports(status);
CREATE INDEX IF NOT EXISTS idx_external_reports_performance_date ON external_performance_reports(performance_date);
CREATE INDEX IF NOT EXISTS idx_external_reports_reported_by ON external_performance_reports(reported_by);

-- RLS有効化
ALTER TABLE external_performance_reports ENABLE ROW LEVEL SECURITY;

-- updated_at トリガー
CREATE TRIGGER update_external_performance_reports_updated_at 
  BEFORE UPDATE ON external_performance_reports 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 2. RLSポリシー
-- ================================================

-- 自組織の報告は閲覧・作成可能
CREATE POLICY external_reports_org_select ON external_performance_reports
  FOR SELECT USING (
    organization_id = current_organization_id()
    OR is_license_manager()  -- ライセンス管理組織は全報告を閲覧可能
    OR is_admin()
  );

CREATE POLICY external_reports_org_insert ON external_performance_reports
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
  );

-- 自組織の報告は更新可能（ただし pending 状態のみ）
CREATE POLICY external_reports_org_update ON external_performance_reports
  FOR UPDATE USING (
    (organization_id = current_organization_id() AND status = 'pending')
    OR is_license_manager()  -- ライセンス管理組織は承認のため更新可能
    OR is_admin()
  );

-- 自組織の報告は削除可能（ただし pending 状態のみ）
CREATE POLICY external_reports_org_delete ON external_performance_reports
  FOR DELETE USING (
    (organization_id = current_organization_id() AND status = 'pending')
    OR is_admin()
  );

-- ================================================
-- 3. ライセンス集計用ビュー
-- ================================================
CREATE OR REPLACE VIEW license_performance_summary AS
SELECT 
  s.id AS scenario_id,
  s.title AS scenario_title,
  s.author,
  s.license_amount,
  
  -- 内部公演（自社 schedule_events）
  COALESCE(internal.internal_count, 0) AS internal_performance_count,
  
  -- 外部報告（承認済みのみ）
  COALESCE(external.external_count, 0) AS external_performance_count,
  
  -- 合計
  COALESCE(internal.internal_count, 0) + COALESCE(external.external_count, 0) AS total_performance_count,
  
  -- ライセンス料合計
  (COALESCE(internal.internal_count, 0) + COALESCE(external.external_count, 0)) * COALESCE(s.license_amount, 0) AS total_license_fee

FROM scenarios s

LEFT JOIN (
  SELECT 
    scenario_id,
    COUNT(*) AS internal_count
  FROM schedule_events
  WHERE is_cancelled = false
    AND category NOT IN ('venue_rental', 'venue_rental_free', 'mtg')
  GROUP BY scenario_id
) internal ON internal.scenario_id = s.id

LEFT JOIN (
  SELECT 
    scenario_id,
    SUM(performance_count) AS external_count
  FROM external_performance_reports
  WHERE status = 'approved'
  GROUP BY scenario_id
) external ON external.scenario_id = s.id

WHERE s.scenario_type = 'managed'  -- 管理シナリオのみ
ORDER BY s.title;

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT * FROM external_performance_reports;
-- SELECT * FROM license_performance_summary;

