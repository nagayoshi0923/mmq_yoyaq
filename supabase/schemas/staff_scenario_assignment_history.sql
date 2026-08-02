-- 正規ソース: supabase/schemas/staff_scenario_assignment_history.sql
-- 最終更新: 2026-08-02（YOYAQ-011）
-- スタッフ⇔シナリオ担当の変更履歴。staff_scenario_assignments の増減差分だけを記録する。
-- 書き込み・参照は api/assignments.ts の service_role 経由のみ。anon/authenticated には GRANT しない。
CREATE TABLE public.staff_scenario_assignment_history (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id),
  staff_id           uuid        NOT NULL REFERENCES public.staff(id),
  scenario_master_id uuid        NOT NULL REFERENCES public.scenario_masters(id),
  action             text        NOT NULL CHECK (action IN ('added', 'removed')),
  changed_by         uuid,
  changed_at         timestamptz NOT NULL DEFAULT now(),
  source             text        NOT NULL DEFAULT 'api'
);

CREATE INDEX idx_ssa_history_staff_changed_at
  ON public.staff_scenario_assignment_history (staff_id, changed_at DESC);
CREATE INDEX idx_ssa_history_org
  ON public.staff_scenario_assignment_history (organization_id);

ALTER TABLE public.staff_scenario_assignment_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_scenario_assignment_history FROM anon;
REVOKE ALL ON public.staff_scenario_assignment_history FROM authenticated;
