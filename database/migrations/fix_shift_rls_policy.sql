-- =============================================================================
-- shift_submissions RLSポリシーを改善
-- 問題：get_user_organization_id()がNULLの場合にアクセスできなくなる
-- 解決：スタッフ本人のシフトは必ず見れるようにする
-- =============================================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS shift_submissions_org_policy ON shift_submissions;
DROP POLICY IF EXISTS shift_submissions_strict ON shift_submissions;
DROP POLICY IF EXISTS shift_submissions_improved ON shift_submissions;

-- 改善版ポリシーを作成
-- スタッフ本人のシフトは必ず見れるようにする（SELECT/UPDATE/DELETE用）
CREATE POLICY shift_submissions_improved ON shift_submissions FOR ALL USING (
  -- 1. 自分のシフト（staff.user_idが自分の場合）- 最優先
  staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid()
  )
  -- 2. 組織IDが一致する場合（管理者や他のスタッフのシフト閲覧用）
  OR organization_id = get_user_organization_id()
  -- 3. 組織管理者（全組織のシフトを見れる）
  OR is_org_admin()
);

-- INSERT時のチェック（WITH CHECK）
-- 自分のスタッフIDか、組織IDが一致する場合のみ挿入可能
ALTER POLICY shift_submissions_improved ON shift_submissions WITH CHECK (
  -- 自分のシフトとして挿入
  staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid()
  )
  -- または組織IDが一致
  OR organization_id = get_user_organization_id()
  -- または管理者
  OR is_org_admin()
);

COMMENT ON POLICY shift_submissions_improved ON shift_submissions IS 
  'スタッフは自分のシフトを必ず読み書きできる。組織メンバーは組織内のシフトを参照可能。管理者は全てのシフトにアクセス可能。';

-- デバッグ用：現在のポリシーを確認
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'shift_submissions';
