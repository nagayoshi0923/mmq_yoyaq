import { apiClient } from '@/lib/apiClient'
import type { SalarySettings } from '@/hooks/useSalarySettings'

export interface SalaryStaff {
  id: string
  name: string
  role: string[] | null
  stores: string[] | null
}
export interface SalaryEventStaff {
  staff_id: string | null
  staff_name: string | null
  role: 'main' | 'sub' | 'reception' | 'staff' | 'observer'
  ordinal: number
  resolution_status: 'resolved' | 'unmatched' | 'duplicate'
  role_confirmed: boolean
}
export interface SalaryEvent {
  id: string
  date: string
  store_id: string
  scenario: string | null
  scenario_master_id: string | null
  gms: string[] | null
  gm_roles: Record<string, string> | null
  staff_assignments: SalaryEventStaff[]
  category: string
  is_cancelled: boolean
  stores: { name: string; transport_allowance?: number | null } | null
  scenarios?: { duration: number | null; gm_costs: import('@/lib/compensation').IndividualGmCost[] | null } | null
  scenario_masters: { title: string; official_duration: number } | null
}
export interface SalaryTransaction {
  id: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description: string | null
  scenario_id: string | null
  store_id: string | null
  schedule_event_id: string | null
}

async function get<T>(type: string, start: string, end: string, expectedOrgId: string): Promise<T> {
  const params = new URLSearchParams({ type, start, end })
  const result = await apiClient.get<T & { organizationId: string }>(`/api/sales?${params}`)
  if (result.organizationId !== expectedOrgId) throw new Error('組織が切り替わりました。再読み込みしてください。')
  return result
}
export const salaryReportApi = {
  history: (start: string, end: string, org: string) => get<{ history: SalarySettings[] }>('salary-history', start, end, org),
  salaryInputs: (start: string, end: string, org: string) => get<{ staff: SalaryStaff[]; events: SalaryEvent[] }>('salary-inputs', start, end, org),
  salesCosts: (start: string, end: string, org: string) => get<{ staff: SalaryStaff[]; transactions: SalaryTransaction[] }>('sales-cost-inputs', start, end, org),
}
