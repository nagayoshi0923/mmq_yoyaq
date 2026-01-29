-- =============================================================================
-- Part A: RLS 用の関数を作成
-- =============================================================================

-- 現在のユーザーの organization_id を取得する関数
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ユーザーが管理者かどうかを判定する関数
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 確認
SELECT 'Functions created successfully' as result;





