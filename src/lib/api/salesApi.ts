/**
 * 売上分析関連API
 *
 * read 系メソッドはすべてバックエンド API (/api/sales) 経由。
 * org_id はサーバー側で JWT から取得するため、クライアントからは渡さない。
 */
import { apiClient } from '@/lib/apiClient'

// ── 戻り値型 ──────────────────────────────────────────────────────────────
// NOTE: 既存呼び出し側との互換性のため、サーバー側で null になりうるフィールドも
// 呼び出し側が前提とする string 型に寄せている。

export interface SalesPeriodEvent {
  id: string
  organization_id: string
  date: string
  start_time?: string
  end_time?: string
  store_id: string
  venue?: string
  scenario_master_id?: string
  scenario?: string
  organization_scenario_id?: string
  category: string
  gms?: string[]
  gm_roles?: Record<string, string>
  capacity?: number
  max_participants?: number
  venue_rental_fee?: number
  is_cancelled: boolean
  // enrich 結果
  scenarios?: {
    id?: string
    title?: string
    author?: string
    duration?: number
    participation_fee?: number
    gm_test_participation_fee?: number
    participation_costs?: Array<{ item: string; amount: number; startDate?: string; endDate?: string; status?: string }>
    license_amount?: number
    gm_test_license_amount?: number
    franchise_license_amount?: number
    franchise_gm_test_license_amount?: number
    external_license_amount?: number
    external_gm_test_license_amount?: number
    fc_receive_license_amount?: number
    fc_receive_gm_test_license_amount?: number
    fc_author_license_amount?: number
    fc_author_gm_test_license_amount?: number
    scenario_type?: string
    gm_costs?: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }>
    production_costs?: Array<{ item: string; amount: number; startDate?: string; endDate?: string; status?: string }>
    required_props?: Array<{ item: string; amount: number; startDate?: string; endDate?: string; status?: string }>
  }
  revenue: number
  actual_participants: number
  has_demo_participant: boolean
  // 互換性のため任意フィールド
  current_participants?: number
}

export interface SalesStore {
  id: string
  name: string
  short_name: string
  fixed_costs?: Array<{
    item: string
    amount: number
    frequency?: 'monthly' | 'yearly' | 'one-time'
    startDate?: string
    endDate?: string
  }>
  ownership_type?: 'corporate' | 'franchise' | 'office'
  transport_allowance?: number
  franchise_fee?: number
  franchise_fee_type?: 'fixed' | 'percent'
  franchise_fee_percent?: number
}

export interface ScenarioPerformanceItem {
  id: string
  title: string
  author: string
  category: 'open' | 'gmtest'
  events: number
  stores: string[]
  // 互換性のため：旧コードが perf.store_id にアクセスするケースがある
  store_id?: string
}

export interface OpenEventAnalysisItem {
  id: string
  date: string
  start_time: string | null
  scenario: string | null
  scenario_master_id: string | null
  capacity: number | null
  max_participants: number | null
  current_participants: number | null
  is_cancelled: boolean
  created_at: string
  store_id: string | null
  category?: string | null
}

export interface OpenEventReservation {
  id: string
  schedule_event_id: string
  created_at: string
  participant_count: number | null
  status: string
}

export interface AnnualAnalysisItem {
  year: number
  totalRevenue: number
  totalEvents: number
  monthlyRevenue: number[]
  monthlyEvents: number[]
  growthRate: number | null
}

export interface ScheduleExportRow {
  date: string
  start_time: string
  end_time: string
  store_name: string
  scenario: string
  category: string
  is_cancelled: boolean
  gms: string
  capacity: number
  total_participants: number
  regular_participants: number
  staff_participants: number
  staff_participant_names: string
  onsite_amount: number
  online_amount: number
  total_revenue: number
  license_amount: number
  gm_cost: number
  net_profit: number
}

export const salesApi = {
  // 期間別売上データを取得
  // organizationId は後方互換のため引数を残すが、バックエンド経由ではサーバー側で JWT から取得するため未使用
  async getSalesByPeriod(startDate: string, endDate: string, _organizationId?: string): Promise<SalesPeriodEvent[]> {
    const params = new URLSearchParams({
      type: 'by-period',
      start: startDate,
      end: endDate,
    })
    return apiClient.get<SalesPeriodEvent[]>(`/api/sales?${params.toString()}`)
  },

  // 店舗別売上データを取得
  async getSalesByStore(startDate: string, endDate: string): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams({
      type: 'by-store',
      start: startDate,
      end: endDate,
    })
    return apiClient.get<Array<Record<string, unknown>>>(`/api/sales?${params.toString()}`)
  },

  // シナリオ別売上データを取得
  async getSalesByScenario(startDate: string, endDate: string): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams({
      type: 'by-scenario',
      start: startDate,
      end: endDate,
    })
    return apiClient.get<Array<Record<string, unknown>>>(`/api/sales?${params.toString()}`)
  },

  // 作者別公演実行回数を取得
  async getPerformanceCountByAuthor(startDate: string, endDate: string): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams({
      type: 'author-performance-count',
      start: startDate,
      end: endDate,
    })
    return apiClient.get<Array<Record<string, unknown>>>(`/api/sales?${params.toString()}`)
  },

  // 店舗一覧を取得
  async getStores(): Promise<SalesStore[]> {
    const params = new URLSearchParams({ type: 'stores' })
    return apiClient.get<SalesStore[]>(`/api/sales?${params.toString()}`)
  },

  // シナリオ別公演数データ取得
  async getScenarioPerformance(startDate: string, endDate: string, storeIds?: string[]): Promise<ScenarioPerformanceItem[]> {
    const params = new URLSearchParams({
      type: 'scenario-performance',
      start: startDate,
      end: endDate,
    })
    if (storeIds && storeIds.length > 0) {
      params.set('store_ids', storeIds.join(','))
    }
    return apiClient.get<ScenarioPerformanceItem[]>(`/api/sales?${params.toString()}`)
  },

  // オープン公演分析データを取得
  async getOpenEventAnalysis(
    startDate: string,
    endDate: string,
    storeIds?: string[],
    includeGmTest = false,
  ): Promise<{ events: OpenEventAnalysisItem[]; reservations: OpenEventReservation[] }> {
    const params = new URLSearchParams({
      type: 'open-event-analysis',
      start: startDate,
      end: endDate,
    })
    if (storeIds && storeIds.length > 0) {
      params.set('store_ids', storeIds.join(','))
    }
    if (includeGmTest) {
      params.set('include_gm_test', 'true')
    }
    return apiClient.get<{ events: OpenEventAnalysisItem[]; reservations: OpenEventReservation[] }>(
      `/api/sales?${params.toString()}`
    )
  },

  // スケジュールCSVエクスポート用データを取得
  async getScheduleExportData(startDate: string, endDate: string): Promise<ScheduleExportRow[]> {
    const params = new URLSearchParams({
      type: 'schedule-export',
      start: startDate,
      end: endDate,
    })
    return apiClient.get<ScheduleExportRow[]>(`/api/sales?${params.toString()}`)
  },

  // 年間分析データ（年月別の集計済みデータ）を取得
  async getAnnualAnalysis(storeIds: string[] = [], startYear = 2022): Promise<AnnualAnalysisItem[]> {
    const params = new URLSearchParams({
      type: 'annual-analysis',
      start_year: String(startYear),
    })
    if (storeIds.length > 0) {
      params.set('store_ids', storeIds.join(','))
    }
    return apiClient.get<AnnualAnalysisItem[]>(`/api/sales?${params.toString()}`)
  },
}
