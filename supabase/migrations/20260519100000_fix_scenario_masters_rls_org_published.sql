-- scenario_masters RLS 追加
--
-- 問題: scenario_masters_select_public を DROP したことで
--   「組織が org_status=available で公開しているシナリオのマスタ」が
--   顧客・匿名ユーザーから見えなくなった。
--   承認済み(approved)でなくても、組織が公開済みなら予約サイトに表示すべき。
--
-- 修正: org_status='available' の organization_scenarios が存在する場合、
--   master_status を問わず閲覧可能にする。

CREATE POLICY scenario_masters_select_if_org_published ON public.scenario_masters FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_scenarios
    WHERE scenario_master_id = scenario_masters.id
      AND org_status = 'available'
  )
);
