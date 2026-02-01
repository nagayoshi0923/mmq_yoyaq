-- Kit Management: キット配置管理機能
-- シナリオごとのキットの現在位置と移動イベントを管理

-- ============================================
-- 1. scenario_kit_locations（キット現在位置）
-- ============================================
CREATE TABLE IF NOT EXISTS scenario_kit_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  kit_number INTEGER NOT NULL DEFAULT 1,  -- 複数キットがある場合の番号（1から始まる）
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,  -- 現在の店舗
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- 同一組織・シナリオ・キット番号は一意
  UNIQUE(organization_id, scenario_id, kit_number)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_scenario_kit_locations_org ON scenario_kit_locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_scenario_kit_locations_scenario ON scenario_kit_locations(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_kit_locations_store ON scenario_kit_locations(store_id);

-- RLSポリシー
ALTER TABLE scenario_kit_locations ENABLE ROW LEVEL SECURITY;

-- 組織メンバーのみ閲覧可能
CREATE POLICY "scenario_kit_locations_select_policy" ON scenario_kit_locations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のadmin/ownerのみ挿入可能
CREATE POLICY "scenario_kit_locations_insert_policy" ON scenario_kit_locations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff 
      WHERE user_id = auth.uid() 
      AND ('admin' = ANY(role) OR 'owner' = ANY(role))
    )
  );

-- 組織のadmin/ownerのみ更新可能
CREATE POLICY "scenario_kit_locations_update_policy" ON scenario_kit_locations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff 
      WHERE user_id = auth.uid() 
      AND ('admin' = ANY(role) OR 'owner' = ANY(role))
    )
  );

-- 組織のadmin/ownerのみ削除可能
CREATE POLICY "scenario_kit_locations_delete_policy" ON scenario_kit_locations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff 
      WHERE user_id = auth.uid() 
      AND ('admin' = ANY(role) OR 'owner' = ANY(role))
    )
  );

-- ============================================
-- 2. kit_transfer_events（キット移動イベント）
-- ============================================
CREATE TABLE IF NOT EXISTS kit_transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  kit_number INTEGER NOT NULL DEFAULT 1,
  from_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  to_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  transfer_date DATE NOT NULL,  -- 移動日
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_org ON kit_transfer_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_scenario ON kit_transfer_events(scenario_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_date ON kit_transfer_events(transfer_date);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_status ON kit_transfer_events(status);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_from_store ON kit_transfer_events(from_store_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_to_store ON kit_transfer_events(to_store_id);

-- RLSポリシー
ALTER TABLE kit_transfer_events ENABLE ROW LEVEL SECURITY;

-- 組織メンバーのみ閲覧可能
CREATE POLICY "kit_transfer_events_select_policy" ON kit_transfer_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは挿入可能
CREATE POLICY "kit_transfer_events_insert_policy" ON kit_transfer_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは更新可能
CREATE POLICY "kit_transfer_events_update_policy" ON kit_transfer_events
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 組織のadmin/ownerのみ削除可能
CREATE POLICY "kit_transfer_events_delete_policy" ON kit_transfer_events
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff 
      WHERE user_id = auth.uid() 
      AND ('admin' = ANY(role) OR 'owner' = ANY(role))
    )
  );

-- ============================================
-- 3. updated_at自動更新トリガー
-- ============================================

-- scenario_kit_locations用トリガー
CREATE OR REPLACE FUNCTION update_scenario_kit_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_scenario_kit_locations_updated_at
  BEFORE UPDATE ON scenario_kit_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_scenario_kit_locations_updated_at();

-- kit_transfer_events用トリガー
CREATE OR REPLACE FUNCTION update_kit_transfer_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kit_transfer_events_updated_at
  BEFORE UPDATE ON kit_transfer_events
  FOR EACH ROW
  EXECUTE FUNCTION update_kit_transfer_events_updated_at();

-- ============================================
-- 4. キット移動完了時に位置を自動更新するトリガー
-- ============================================
CREATE OR REPLACE FUNCTION sync_kit_location_on_transfer_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- ステータスが 'completed' に変更された場合、キット位置を更新
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO scenario_kit_locations (organization_id, scenario_id, kit_number, store_id)
    VALUES (NEW.organization_id, NEW.scenario_id, NEW.kit_number, NEW.to_store_id)
    ON CONFLICT (organization_id, scenario_id, kit_number)
    DO UPDATE SET 
      store_id = EXCLUDED.store_id,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_kit_location_on_transfer_complete
  AFTER INSERT OR UPDATE ON kit_transfer_events
  FOR EACH ROW
  EXECUTE FUNCTION sync_kit_location_on_transfer_complete();

-- ============================================
-- 5. コメント
-- ============================================
COMMENT ON TABLE scenario_kit_locations IS 'シナリオキットの現在位置を管理';
COMMENT ON COLUMN scenario_kit_locations.kit_number IS 'キット番号（1から始まる。kit_countが2以上の場合に複数レコード）';
COMMENT ON COLUMN scenario_kit_locations.store_id IS 'キットが現在置いてある店舗';

COMMENT ON TABLE kit_transfer_events IS 'キット移動イベント（いつ、どのキットを、どこからどこへ移動するか）';
COMMENT ON COLUMN kit_transfer_events.status IS 'pending=予定, completed=完了, cancelled=キャンセル';
COMMENT ON COLUMN kit_transfer_events.transfer_date IS '移動を行う日付';
