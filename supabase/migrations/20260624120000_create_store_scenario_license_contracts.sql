-- 店舗ごとの契約済みシナリオと請求条件を管理する

CREATE TABLE IF NOT EXISTS public.store_scenario_license_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE RESTRICT,
  license_manager_type TEXT NOT NULL DEFAULT 'qw_managed',
  standard_license_amount INTEGER NOT NULL DEFAULT 0,
  contracted_count INTEGER NOT NULL DEFAULT 1,
  contract_start_date DATE,
  contract_end_date DATE,
  billing_status TEXT NOT NULL DEFAULT 'billable',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_scenario_license_contracts_manager_type_check
    CHECK (license_manager_type IN ('qw_managed', 'external_rights_holder', 'buyout', 'in_house')),
  CONSTRAINT store_scenario_license_contracts_billing_status_check
    CHECK (billing_status IN ('billable', 'not_billable', 'exempt', 'pending_confirmation')),
  CONSTRAINT store_scenario_license_contracts_amount_check
    CHECK (standard_license_amount >= 0),
  CONSTRAINT store_scenario_license_contracts_count_check
    CHECK (contracted_count >= 0),
  CONSTRAINT store_scenario_license_contracts_period_check
    CHECK (contract_end_date IS NULL OR contract_start_date IS NULL OR contract_end_date >= contract_start_date),
  UNIQUE (organization_id, store_id, scenario_master_id)
);

CREATE INDEX IF NOT EXISTS idx_store_scenario_license_contracts_org
  ON public.store_scenario_license_contracts (organization_id);

CREATE INDEX IF NOT EXISTS idx_store_scenario_license_contracts_store
  ON public.store_scenario_license_contracts (store_id);

CREATE INDEX IF NOT EXISTS idx_store_scenario_license_contracts_scenario
  ON public.store_scenario_license_contracts (scenario_master_id);

CREATE INDEX IF NOT EXISTS idx_store_scenario_license_contracts_billing_status
  ON public.store_scenario_license_contracts (billing_status);

DROP TRIGGER IF EXISTS update_store_scenario_license_contracts_updated_at
  ON public.store_scenario_license_contracts;
CREATE TRIGGER update_store_scenario_license_contracts_updated_at
  BEFORE UPDATE ON public.store_scenario_license_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.store_scenario_license_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_scenario_license_contracts_select" ON public.store_scenario_license_contracts;
CREATE POLICY "store_scenario_license_contracts_select"
  ON public.store_scenario_license_contracts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
    OR public.is_license_admin()
  );

DROP POLICY IF EXISTS "store_scenario_license_contracts_insert" ON public.store_scenario_license_contracts;
CREATE POLICY "store_scenario_license_contracts_insert"
  ON public.store_scenario_license_contracts
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "store_scenario_license_contracts_update" ON public.store_scenario_license_contracts;
CREATE POLICY "store_scenario_license_contracts_update"
  ON public.store_scenario_license_contracts
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "store_scenario_license_contracts_delete" ON public.store_scenario_license_contracts;
CREATE POLICY "store_scenario_license_contracts_delete"
  ON public.store_scenario_license_contracts
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_scenario_license_contracts TO authenticated;

COMMENT ON TABLE public.store_scenario_license_contracts IS
  '店舗ごとの契約済みシナリオ、契約本数、契約期間、請求区分を管理する契約マスタ。';
