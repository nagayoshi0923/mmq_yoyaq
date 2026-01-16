-- ライセンス報告送信履歴テーブル
CREATE TABLE IF NOT EXISTS license_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  author_name TEXT NOT NULL,
  author_email TEXT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  sent_by UUID REFERENCES users(id),
  total_events INTEGER NOT NULL DEFAULT 0,
  total_license_cost INTEGER NOT NULL DEFAULT 0,
  scenarios JSONB,  -- 送信したシナリオ情報
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- 同じ作者・年月は1レコードのみ（再送信時は上書き）
  UNIQUE(organization_id, author_name, year, month)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_license_report_history_org 
  ON license_report_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_license_report_history_author 
  ON license_report_history(author_name);
CREATE INDEX IF NOT EXISTS idx_license_report_history_year_month 
  ON license_report_history(year, month);

-- RLSポリシー
ALTER TABLE license_report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "license_report_history_select" ON license_report_history
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "license_report_history_insert" ON license_report_history
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "license_report_history_update" ON license_report_history
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- コメント
COMMENT ON TABLE license_report_history IS 'ライセンス報告の送信履歴';
COMMENT ON COLUMN license_report_history.author_name IS '作者名（報告用表示名）';
COMMENT ON COLUMN license_report_history.scenarios IS '送信したシナリオ情報（JSON配列）';

-- 確認
SELECT 'license_report_history テーブルを作成しました' as message;

