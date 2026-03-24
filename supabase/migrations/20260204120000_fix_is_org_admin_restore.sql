-- =============================================================================
-- 緊急修正: is_org_admin() 関数を正しい状態に復元
-- =============================================================================
-- 
-- 問題:
--   前のマイグレーションで is_org_admin() が誤って上書きされた可能性がある
--   - 誤: role = 'org_admin' をチェック
--   - 正: role = 'admin' をチェック
-- 
-- =============================================================================

-- 正しい is_org_admin() 関数を復元
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE SQL SECURITY INVOKER STABLE;

COMMENT ON FUNCTION public.is_org_admin() IS 
'ユーザーが管理者（role = admin）かどうかを判定。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ is_org_admin() 関数を正しい状態に復元しました';
END $$;
