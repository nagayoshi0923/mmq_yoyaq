-- shift_submissions RLSポリシーを改善
-- 問題：get_user_organization_id()がNULLの場合にアクセスできなくなる

-- 既存ポリシーを削除
DROP POLICY IF EXISTS shift_submissions_org_policy ON shift_submissions;
DROP POLICY IF EXISTS shift_submissions_strict ON shift_submissions;

-- 改善版ポリシーを作成
-- スタッフ本人のシフトは必ず見れるようにする
CREATE POLICY shift_submissions_improved ON shift_submissions FOR ALL USING (
  -- 1. 組織IDが一致する場合
  organization_id = get_user_organization_id()
  -- 2. 組織管理者
  OR is_org_admin()
  -- 3. 自分のシフト（staff.user_idが自分の場合）
  OR staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid()
  )
);

COMMENT ON POLICY shift_submissions_improved ON shift_submissions IS 
  'スタッフは自分のシフトを必ず読み書きできる。組織メンバーは組織内のシフトを参照可能。';

