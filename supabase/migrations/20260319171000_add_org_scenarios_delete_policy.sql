-- ============================================================
-- organization_scenarios テーブルの DELETE ポリシーを追加
-- + get_user_organization_id() 関数の修正（staff テーブルにフォールバック）
-- 作成日: 2026-03-19
-- 
-- 目的:
--   シナリオ管理画面でシナリオを解除（削除）できるようにする
--   - 組織の管理者は自組織のシナリオを削除可能
--   - ライセンス管理者は全組織のシナリオを削除可能
-- ============================================================

-- ============================================================
-- get_user_organization_id() 関数を修正
-- users テーブルになければ staff テーブルにフォールバック
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- まず users テーブルから取得
  SELECT organization_id INTO org_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
  
  -- users になければ staff テーブルから取得（フォールバック）
  IF org_id IS NULL THEN
    SELECT organization_id INTO org_id
    FROM public.staff
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

COMMENT ON FUNCTION public.get_user_organization_id() IS 
  'ユーザーの organization_id を取得。users → staff の順にフォールバック。';

-- DELETE ポリシーを追加（存在しない場合のみ）
DO $$ 
BEGIN
  -- 既存のポリシーを削除
  DROP POLICY IF EXISTS "org_scenarios_delete" ON public.organization_scenarios;
  
  -- 新しい DELETE ポリシーを作成
  CREATE POLICY "org_scenarios_delete" ON public.organization_scenarios
    FOR DELETE
    USING (
      (organization_id = get_user_organization_id()) 
      OR is_license_admin()
    );
  
  RAISE NOTICE 'org_scenarios_delete ポリシーを作成しました';
END $$;

-- ============================================================
-- UPDATE ポリシーも確認・修正
-- スタッフロールでも更新できるようにする
-- ============================================================

DO $$ 
BEGIN
  -- 既存のポリシーを削除
  DROP POLICY IF EXISTS "org_scenarios_update" ON public.organization_scenarios;
  DROP POLICY IF EXISTS "org_scenarios_update_staff" ON public.organization_scenarios;
  
  -- スタッフも更新可能なポリシーを作成
  CREATE POLICY "org_scenarios_update" ON public.organization_scenarios
    FOR UPDATE
    USING (
      (organization_id = get_user_organization_id()) 
      OR is_license_admin()
    )
    WITH CHECK (
      (organization_id = get_user_organization_id()) 
      OR is_license_admin()
    );
  
  RAISE NOTICE 'org_scenarios_update ポリシーを更新しました';
END $$;
