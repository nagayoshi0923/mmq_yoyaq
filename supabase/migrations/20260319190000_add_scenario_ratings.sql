-- シナリオ評価テーブル（おすすめ度）
CREATE TABLE IF NOT EXISTS scenario_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES scenario_masters(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, scenario_master_id)
);

COMMENT ON TABLE scenario_ratings IS 'ユーザーのシナリオおすすめ度評価（1〜5）';
COMMENT ON COLUMN scenario_ratings.rating IS 'おすすめ度（1〜5の星評価）';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_scenario_ratings_customer_id ON scenario_ratings(customer_id);
CREATE INDEX IF NOT EXISTS idx_scenario_ratings_scenario_master_id ON scenario_ratings(scenario_master_id);

-- RLS有効化
ALTER TABLE scenario_ratings ENABLE ROW LEVEL SECURITY;

-- 自分の評価のみ参照・編集可
CREATE POLICY "customers can read own ratings"
  ON scenario_ratings FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE email = auth.email()
    )
  );

CREATE POLICY "customers can insert own ratings"
  ON scenario_ratings FOR INSERT
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers WHERE email = auth.email()
    )
  );

CREATE POLICY "customers can update own ratings"
  ON scenario_ratings FOR UPDATE
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE email = auth.email()
    )
  );

CREATE POLICY "customers can delete own ratings"
  ON scenario_ratings FOR DELETE
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE email = auth.email()
    )
  );

-- スタッフも閲覧可（管理用）
CREATE POLICY "staff can read all ratings"
  ON scenario_ratings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid()
    )
  );
