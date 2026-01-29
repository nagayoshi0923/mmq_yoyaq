-- =============================================================================
-- マイグレーション 021: is_org_admin関数のRLS問題修正
-- =============================================================================
-- 
-- 🚨 問題:
--   is_org_admin() 関数が users テーブルを参照するが、usersテーブルの
--   RLSポリシーが「自分自身のレコードのみ」に制限されているため、
--   waitlistへのINSERT時にSELECTポリシーで is_org_admin() が呼ばれると
--   "permission denied for table users" エラーが発生
-- 
-- ✅ 解決策:
--   is_org_admin() 関数を SECURITY DEFINER + row_security = off で
--   RLSをバイパスするように修正
-- 
-- =============================================================================

-- is_org_admin 関数を修正（RLSをバイパス）
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER 
   STABLE
   SET search_path = public
   SET row_security = off;

COMMENT ON FUNCTION is_org_admin() IS 
'ユーザーが管理者かどうかを判定。SECURITY DEFINER + row_security=off でRLSをバイパス。';

-- get_user_organization_id も同様に修正（念のため）
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- staff テーブルから organization_id を取得
  SELECT organization_id INTO org_id
  FROM staff
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER 
   STABLE
   SET search_path = public
   SET row_security = off;

COMMENT ON FUNCTION get_user_organization_id() IS 
'現在のユーザーの組織IDを取得。SECURITY DEFINER + row_security=off でRLSをバイパス。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 021 完了: is_org_admin と get_user_organization_id のRLSバイパスを修正';
END $$;
