-- =============================================================================
-- 024: お問い合わせ RLS ポリシー追加
-- =============================================================================
-- 問題: contact_inquiries テーブルで RLS 有効だがポリシー未設定
--       → 全ての操作がブロックされ、お問い合わせが送信できない
-- 対策: 適切な RLS ポリシーを追加
-- =============================================================================

-- 既存のポリシーがあれば削除
DROP POLICY IF EXISTS "contact_inquiries_service_policy" ON contact_inquiries;
DROP POLICY IF EXISTS "contact_inquiries_insert" ON contact_inquiries;
DROP POLICY IF EXISTS "contact_inquiries_select" ON contact_inquiries;
DROP POLICY IF EXISTS "contact_inquiries_update" ON contact_inquiries;

-- INSERT: 誰でも問い合わせ可能（公開フォーム）
-- Edge Function は service_role で実行するが、安全のため匿名挿入も許可
CREATE POLICY "contact_inquiries_insert" ON contact_inquiries
  FOR INSERT
  WITH CHECK (true);

-- SELECT: 組織スタッフまたは管理者のみ閲覧可能
CREATE POLICY "contact_inquiries_select" ON contact_inquiries
  FOR SELECT
  USING (
    -- 自組織の問い合わせ
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid() AND status = 'active'
    )
    -- OR 管理者
    OR is_org_admin()
    -- OR 組織未指定（全体への問い合わせ）で管理者
    OR (organization_id IS NULL AND is_org_admin())
  );

-- UPDATE: 組織スタッフまたは管理者のみ（対応ステータス更新用）
CREATE POLICY "contact_inquiries_update" ON contact_inquiries
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid() AND status = 'active'
    )
    OR is_org_admin()
  );

-- DELETE: 管理者のみ
CREATE POLICY "contact_inquiries_delete" ON contact_inquiries
  FOR DELETE
  USING (is_org_admin());

COMMENT ON POLICY "contact_inquiries_insert" ON contact_inquiries IS 
'お問い合わせ: 誰でも送信可能（公開フォーム）';
