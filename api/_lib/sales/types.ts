// api/sales.ts から切り出した型（整備 Phase 3、#774）。挙動は変えない。

export type ScheduleEvent = {
  id: string
  organization_id: string
  date: string
  start_time: string | null
  end_time: string | null
  store_id: string | null
  venue: string | null
  scenario_master_id: string | null
  scenario: string | null
  organization_scenario_id: string | null
  category: string | null
  gms: string[] | null
  gm_roles: Record<string, string> | null
  capacity: number | null
  max_participants: number | null
  venue_rental_fee: number | null
  is_cancelled: boolean | null
}

export type ScenarioForPeriod = {
  id: string
  title: string
  author: string | null
  duration: number | null
  participation_fee: number | null
  gm_test_participation_fee: number | null
  participation_costs: unknown
  license_amount: number | null
  gm_test_license_amount: number | null
  franchise_license_amount: number | null
  franchise_gm_test_license_amount: number | null
  external_license_amount: number | null
  external_gm_test_license_amount: number | null
  fc_receive_license_amount: number | null
  fc_receive_gm_test_license_amount: number | null
  fc_author_license_amount: number | null
  fc_author_gm_test_license_amount: number | null
  scenario_type: string | null
  gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }> | null
  production_costs: unknown
  required_props: unknown
}

export type OrgScenarioRow = {
  id: string
  scenario_master_id: string | null
  gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }> | null
  license_amount: number | null
  gm_test_license_amount: number | null
  franchise_license_amount: number | null
  franchise_gm_test_license_amount: number | null
  external_license_amount: number | null
  external_gm_test_license_amount: number | null
  fc_receive_license_amount: number | null
  fc_receive_gm_test_license_amount: number | null
  fc_author_license_amount: number | null
  fc_author_gm_test_license_amount: number | null
  participation_fee: number | null
  gm_test_participation_fee: number | null
}

export type ReservationRow = {
  schedule_event_id: string
  participant_count: number | null
  participant_names: string[] | null
  payment_method: string | null
  reservation_source: string | null
  unit_price: number | null
  total_price: number | null
  final_price: number | null
  discount_amount?: number | null
}
