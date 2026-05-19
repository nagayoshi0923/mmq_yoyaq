-- scenario_masters_select_public を削除
-- 問題: `auth.uid() IS NOT NULL` により認証済みユーザーが全マスタ（draft/pending/rejected を含む）を閲覧可能
-- 正しいポリシー scenario_masters_select_public_or_staff が既存のため DROP するだけで解決

DROP POLICY IF EXISTS "scenario_masters_select_public" ON public.scenario_masters;
