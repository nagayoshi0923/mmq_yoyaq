-- 正規ソース: supabase/schemas/staff_scenario_assignments.sql
-- 最終更新: 2026-09-14
-- scenario_master_id が正本。scenario_id は同期トリガーで同一値を維持する互換列。
CREATE TABLE public.staff_scenario_assignments (
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  scenario_id UUID NOT NULL REFERENCES public.scenario_masters(id),
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  can_main_gm BOOLEAN DEFAULT FALSE,
  can_sub_gm BOOLEAN DEFAULT FALSE,
  is_experienced BOOLEAN DEFAULT FALSE,
  experienced_at TIMESTAMPTZ,
  can_gm_at TIMESTAMPTZ,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  PRIMARY KEY (staff_id, scenario_id),
  CONSTRAINT uq_staff_scenario_assignments_master_id UNIQUE (staff_id, scenario_master_id)
);
