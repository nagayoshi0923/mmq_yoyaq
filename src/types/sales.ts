export interface SalesData {
  totalRevenue: number
  totalEvents: number
  averageRevenuePerEvent: number
  totalLicenseCost: number
  totalGmCost: number
  totalProductionCost: number
  totalPropsCost: number
  totalFcCost: number
  totalFixedCost: number
  fixedCostBreakdown: Array<{
    item: string
    amount: number
    store: string
  }>
  productionCostBreakdown: Array<{
    id?: string  // miscTransactionsから追加されたもののみ
    item: string
    amount: number
    scenario: string
    date?: string
    store_id?: string | null
    scenario_id?: string | null
    isEditable?: boolean  // 編集可能かどうか
  }>
  propsCostBreakdown: Array<{
    item: string
    amount: number
    scenario: string
  }>
  totalVariableCost: number
  variableCostBreakdown: Array<{
    category: string
    amount: number
  }>
  // F-1: 収支調整（miscellaneous_transactions を調整エントリとして使う）
  totalAdjustmentIncome: number   // 調整収入合計（総売上に加算される分）
  totalAdjustmentExpense: number  // 調整支出合計（変動費に加算される分）
  adjustmentEntries: Array<{
    id: string
    date: string
    type: 'income' | 'expense'
    amount: number
    category: string
    description?: string | null
    schedule_event_id?: string | null
    store_id?: string | null
  }>
  netProfit: number
  storeRanking: Array<{
    id: string
    name: string
    revenue: number
    events: number
    averageRevenue: number
    licenseCost: number
    gmCost: number
    franchiseFee?: number
    netProfit: number
  }>
  scenarioRanking: Array<{
    id: string
    title: string
    revenue: number
    events: number
    averageRevenue: number
    licenseCost: number
    gmCost: number
    netProfit: number
  }>
  chartData: {
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
      borderColor: string
      backgroundColor: string
      tension: number
    }>
  }
  eventList: Array<{
    id: string
    date: string
    store_id?: string
    store_name: string
    scenario_master_id?: string
    scenario_title: string
    start_time?: string
    end_time?: string
    gms?: string[]
    gm_roles?: Record<string, string>
    venue_rental_fee?: number
    revenue: number
    license_cost: number
    gm_cost: number
    net_profit: number
    participant_count: number
    max_participants?: number
    category?: string
    has_demo_participant?: boolean
  }>
  // 月別売上推移（エクスポート用）
  monthlyRevenue?: Array<{
    month: string
    revenue: number
    events: number
  }>
}

// 顧客関連の型定義
