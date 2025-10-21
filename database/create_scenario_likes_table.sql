-- シナリオいいね機能テーブル
-- 顧客がシナリオにいいねする機能を実装

CREATE TABLE IF NOT EXISTS scenario_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 同じ顧客が同じシナリオに重複していいねできないように制約
  UNIQUE(customer_id, scenario_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_scenario_likes_customer ON scenario_likes(customer_id);
CREATE INDEX IF NOT EXISTS idx_scenario_likes_scenario ON scenario_likes(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_likes_created ON scenario_likes(created_at);

-- RLS (Row Level Security) 設定
ALTER TABLE scenario_likes ENABLE ROW LEVEL SECURITY;

-- ポリシー: ユーザーは自分のいいねのみ参照・作成・削除可能
CREATE POLICY "Users can view their own likes"
  ON scenario_likes FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM customers WHERE id = customer_id));

CREATE POLICY "Users can create their own likes"
  ON scenario_likes FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM customers WHERE id = customer_id));

CREATE POLICY "Users can delete their own likes"
  ON scenario_likes FOR DELETE
  USING (auth.uid() IN (SELECT user_id FROM customers WHERE id = customer_id));

-- 管理者とスタッフはすべて閲覧可能
CREATE POLICY "Admins and staff can view all likes"
  ON scenario_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'staff')
    )
  );

