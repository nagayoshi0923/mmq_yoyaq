-- Kit Transfer Completions: キット移動完了状態管理
-- 誰がどのキットの回収/設置を完了したかを記録

-- ============================================
-- kit_transfer_completions（キット移動完了状態）
-- ============================================
CREATE TABLE IF NOT EXISTS kit_transfer_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- 移動対象キットの特定
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  kit_number INTEGER NOT NULL DEFAULT 1,
  performance_date DATE NOT NULL,  -- どの公演日のための移動か
  from_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  to_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- 完了状態
  picked_up_at TIMESTAMPTZ,  -- 回収完了日時（NULLなら未回収）
  picked_up_by UUID REFERENCES staff(id) ON DELETE SET NULL,  -- 回収したスタッフ
  delivered_at TIMESTAMPTZ,  -- 設置完了日時（NULLなら未設置）
  delivered_by UUID REFERENCES staff(id) ON DELETE SET NULL,  -- 設置したスタッフ
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- 同一組織・シナリオ・キット番号・公演日・移動先は一意
  UNIQUE(organization_id, scenario_id, kit_number, performance_date, to_store_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_org ON kit_transfer_completions(organization_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_scenario ON kit_transfer_completions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_perf_date ON kit_transfer_completions(performance_date);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_to_store ON kit_transfer_completions(to_store_id);

-- RLSポリシー
ALTER TABLE kit_transfer_completions ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除（冪等性のため）
DROP POLICY IF EXISTS "kit_transfer_completions_select_policy" ON kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_insert_policy" ON kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_update_policy" ON kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_delete_policy" ON kit_transfer_completions;

-- 組織メンバーは閲覧可能
CREATE POLICY "kit_transfer_completions_select_policy" ON kit_transfer_completions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは挿入可能（誰でもチェック可能）
CREATE POLICY "kit_transfer_completions_insert_policy" ON kit_transfer_completions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは更新可能
CREATE POLICY "kit_transfer_completions_update_policy" ON kit_transfer_completions
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは削除可能（チェック解除）
CREATE POLICY "kit_transfer_completions_delete_policy" ON kit_transfer_completions
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_kit_transfer_completions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_kit_transfer_completions_updated_at ON kit_transfer_completions;
CREATE TRIGGER update_kit_transfer_completions_updated_at
  BEFORE UPDATE ON kit_transfer_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_kit_transfer_completions_updated_at();

-- リアルタイム購読を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE kit_transfer_completions;

-- コメント
COMMENT ON TABLE kit_transfer_completions IS 'キット移動の完了状態（回収/設置）と担当者を記録';
COMMENT ON COLUMN kit_transfer_completions.picked_up_at IS '回収完了日時';
COMMENT ON COLUMN kit_transfer_completions.picked_up_by IS '回収したスタッフのID';
COMMENT ON COLUMN kit_transfer_completions.delivered_at IS '設置完了日時';
COMMENT ON COLUMN kit_transfer_completions.delivered_by IS '設置したスタッフのID';
