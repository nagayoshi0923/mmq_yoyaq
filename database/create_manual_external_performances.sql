-- 手動入力の他社公演数を保存するテーブル
-- ライセンス管理者がSendReportsで入力した他社公演回数を月別に保存

CREATE TABLE IF NOT EXISTS manual_external_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  scenario_id UUID NOT NULL REFERENCES scenarios(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  performance_count INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- 同じ組織・シナリオ・年月の組み合わせはユニーク
  UNIQUE(organization_id, scenario_id, year, month)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_manual_external_performances_org_year_month 
  ON manual_external_performances(organization_id, year, month);

CREATE INDEX IF NOT EXISTS idx_manual_external_performances_scenario 
  ON manual_external_performances(scenario_id);

-- RLSを有効化
ALTER TABLE manual_external_performances ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can view their org manual externals" ON manual_external_performances
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert their org manual externals" ON manual_external_performances
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update their org manual externals" ON manual_external_performances
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete their org manual externals" ON manual_external_performances
  FOR DELETE USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_manual_external_performances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manual_external_performances_updated_at
  BEFORE UPDATE ON manual_external_performances
  FOR EACH ROW
  EXECUTE FUNCTION update_manual_external_performances_updated_at();

-- コメント
COMMENT ON TABLE manual_external_performances IS 'ライセンス管理者が手動入力した他社公演数（月別）';
COMMENT ON COLUMN manual_external_performances.performance_count IS '他社公演回数';



