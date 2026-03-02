-- クインズワルツのadminにlicense_adminと同等の権限を付与
-- 作成日: 2026-03-02
-- 概要: is_license_admin() 関数を拡張し、クインズワルツ組織のadminも含める

-- ============================================================
-- is_license_admin() 関数を更新
-- 条件: role='license_admin' OR (role='admin' AND organization_id=クインズワルツ)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_license_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_queens_waltz_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (
      role = 'license_admin'
      OR (role = 'admin' AND organization_id = v_queens_waltz_org_id)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_license_admin() IS 
  'license_admin ロールまたはクインズワルツ組織のadminの場合にtrueを返す。scenario_masters等のマスタデータ管理権限を持つ。';

-- 確認用クエリ（実行後に確認）
-- SELECT u.email, u.role, u.organization_id, is_license_admin() as has_license_admin
-- FROM users u
-- WHERE u.role IN ('admin', 'license_admin')
-- ORDER BY u.organization_id, u.role;
