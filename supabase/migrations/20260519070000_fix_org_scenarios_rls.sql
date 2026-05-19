-- organization_scenarios_select_public の修正
-- 問題: `auth.uid() IS NOT NULL` 条件により、認証済みの全ユーザーが全組織のシナリオを閲覧可能になっていた
-- 修正: 公開シナリオ（org_status = 'available'）のみ誰でも閲覧可能にする
--       自組織のシナリオは既存の org_scenarios_select_staff_or_admin ポリシーでカバー

DROP POLICY IF EXISTS "organization_scenarios_select_public" ON public.organization_scenarios;

CREATE POLICY organization_scenarios_select_public ON public.organization_scenarios FOR SELECT
USING (org_status = 'available');

COMMENT ON POLICY organization_scenarios_select_public ON public.organization_scenarios IS
  '公開シナリオ（org_status=available）は未ログインでも閲覧可能。認証ユーザーの全閲覧は廃止。';
