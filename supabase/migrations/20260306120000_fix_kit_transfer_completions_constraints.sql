-- kit_transfer_completions のユニーク制約とRLSポリシーを修正
-- スタッフとadminの両方がキット移動チェック（INSERT/UPDATE）できるようにする

-- ============================================================
-- 1. org_scenario_id ベースの新しいユニーク制約を追加
-- ============================================================

-- 既存の制約を確認・削除
ALTER TABLE kit_transfer_completions
  DROP CONSTRAINT IF EXISTS kit_transfer_completions_org_scenario_unique;

-- org_scenario_id ベースの新しいユニーク制約を追加
-- APIのupsert onConflict と一致させる必要がある
ALTER TABLE kit_transfer_completions
  ADD CONSTRAINT kit_transfer_completions_org_scenario_unique 
  UNIQUE (organization_id, org_scenario_id, kit_number, performance_date, to_store_id);

-- ============================================================
-- 2. RLSポリシーを再作成（スタッフ全員がINSERT/UPDATE/DELETE可能）
-- ============================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "kit_transfer_completions_select_policy" ON kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_insert_policy" ON kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_update_policy" ON kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_delete_policy" ON kit_transfer_completions;

-- SELECT: 組織メンバーは閲覧可能
CREATE POLICY "kit_transfer_completions_select_policy" ON kit_transfer_completions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- INSERT: 組織のスタッフ全員が挿入可能（回収/設置チェック）
CREATE POLICY "kit_transfer_completions_insert_policy" ON kit_transfer_completions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- UPDATE: 組織のスタッフ全員が更新可能（チェック解除含む）
CREATE POLICY "kit_transfer_completions_update_policy" ON kit_transfer_completions
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- DELETE: 組織のスタッフ全員が削除可能（チェック解除）
CREATE POLICY "kit_transfer_completions_delete_policy" ON kit_transfer_completions
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. scenario_kit_locations のRLSポリシーも確認・修正
-- ============================================================

DROP POLICY IF EXISTS "scenario_kit_locations_select_policy" ON scenario_kit_locations;
DROP POLICY IF EXISTS "scenario_kit_locations_insert_policy" ON scenario_kit_locations;
DROP POLICY IF EXISTS "scenario_kit_locations_update_policy" ON scenario_kit_locations;
DROP POLICY IF EXISTS "scenario_kit_locations_delete_policy" ON scenario_kit_locations;

-- SELECT: 組織メンバーは閲覧可能
CREATE POLICY "scenario_kit_locations_select_policy" ON scenario_kit_locations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- INSERT: 組織のスタッフ全員が挿入可能
CREATE POLICY "scenario_kit_locations_insert_policy" ON scenario_kit_locations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- UPDATE: 組織のスタッフ全員が更新可能
CREATE POLICY "scenario_kit_locations_update_policy" ON scenario_kit_locations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- DELETE: 組織のスタッフ全員が削除可能
CREATE POLICY "scenario_kit_locations_delete_policy" ON scenario_kit_locations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. kit_transfer_events のRLSポリシーも確認・修正
-- ============================================================

DROP POLICY IF EXISTS "kit_transfer_events_select_policy" ON kit_transfer_events;
DROP POLICY IF EXISTS "kit_transfer_events_insert_policy" ON kit_transfer_events;
DROP POLICY IF EXISTS "kit_transfer_events_update_policy" ON kit_transfer_events;
DROP POLICY IF EXISTS "kit_transfer_events_delete_policy" ON kit_transfer_events;

-- SELECT: 組織メンバーは閲覧可能
CREATE POLICY "kit_transfer_events_select_policy" ON kit_transfer_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- INSERT: 組織のスタッフ全員が挿入可能
CREATE POLICY "kit_transfer_events_insert_policy" ON kit_transfer_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- UPDATE: 組織のスタッフ全員が更新可能
CREATE POLICY "kit_transfer_events_update_policy" ON kit_transfer_events
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- DELETE: 組織のスタッフ全員が削除可能
CREATE POLICY "kit_transfer_events_delete_policy" ON kit_transfer_events
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 完了
-- ============================================================
