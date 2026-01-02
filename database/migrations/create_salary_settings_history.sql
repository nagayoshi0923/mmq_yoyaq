-- 報酬設定の履歴テーブルを作成
-- 報酬設定を変更した際に、変更日と設定値を記録
-- 過去の公演は、その公演日時点で有効だった設定で報酬計算される
-- 2026-01-02

CREATE TABLE IF NOT EXISTS salary_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- 有効期間
  effective_from date NOT NULL,  -- この設定の有効開始日
  
  -- 報酬設定
  use_hourly_table boolean DEFAULT false,
  gm_base_pay integer DEFAULT 2000,
  gm_hourly_rate integer DEFAULT 1300,
  gm_test_base_pay integer DEFAULT 0,
  gm_test_hourly_rate integer DEFAULT 1300,
  reception_fixed_pay integer DEFAULT 2000,
  hourly_rates jsonb DEFAULT '[]'::jsonb,
  gm_test_hourly_rates jsonb DEFAULT '[]'::jsonb,
  
  -- メタ情報
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- 同じ組織・同じ日付の設定は1つだけ
  UNIQUE(organization_id, effective_from)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_salary_settings_history_org_date 
  ON salary_settings_history(organization_id, effective_from DESC);

-- RLS
ALTER TABLE salary_settings_history ENABLE ROW LEVEL SECURITY;

-- 組織メンバーのみアクセス可能
CREATE POLICY "salary_settings_history_select" ON salary_settings_history
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "salary_settings_history_insert" ON salary_settings_history
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- コメント
COMMENT ON TABLE salary_settings_history IS '報酬設定の履歴。報酬計算時は公演日に基づいて適切な設定を使用';
COMMENT ON COLUMN salary_settings_history.effective_from IS 'この設定が有効になる日付（この日以降の公演に適用）';

-- 既存のglobal_settingsから初期履歴を作成するトリガーは手動で実行
-- 以下のSQLで既存設定を履歴として保存できます：
/*
INSERT INTO salary_settings_history (
  organization_id, 
  effective_from, 
  use_hourly_table,
  gm_base_pay, 
  gm_hourly_rate, 
  gm_test_base_pay, 
  gm_test_hourly_rate, 
  reception_fixed_pay,
  hourly_rates,
  gm_test_hourly_rates
)
SELECT 
  organization_id,
  '2020-01-01'::date,  -- 過去の日付（全ての過去公演に適用）
  COALESCE(use_hourly_table, false),
  COALESCE(gm_base_pay, 2000),
  COALESCE(gm_hourly_rate, 1300),
  COALESCE(gm_test_base_pay, 0),
  COALESCE(gm_test_hourly_rate, 1300),
  COALESCE(reception_fixed_pay, 2000),
  COALESCE(hourly_rates, '[]'::jsonb),
  COALESCE(gm_test_hourly_rates, '[]'::jsonb)
FROM global_settings
WHERE organization_id IS NOT NULL;
*/

