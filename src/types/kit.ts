import type { Scenario } from './scenario'
import type { Store } from './store'

// ================================================
// キット管理関連の型定義
// ================================================

// キット状態の種類
export type KitCondition = 'good' | 'damaged' | 'repairing' | 'missing_parts' | 'retired'

// キット状態のラベル
export const KIT_CONDITION_LABELS: Record<KitCondition, string> = {
  good: '良好',
  damaged: '破損',
  repairing: '修理中',
  missing_parts: '欠けあり',
  retired: '引退'
}

// キット状態の色
export const KIT_CONDITION_COLORS: Record<KitCondition, string> = {
  good: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  damaged: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  repairing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  missing_parts: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  retired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
}

// キット現在位置
export interface KitLocation {
  id: string
  organization_id: string
  scenario_master_id: string
  org_scenario_id?: string | null  // organization_scenarios.id
  kit_number: number  // 1から始まるキット番号
  store_id: string
  condition: KitCondition  // キットの状態
  condition_notes?: string | null  // 状態に関するメモ
  is_fixed?: boolean  // このキット（キット番号ごと）を固定＝移動計画で動かさない
  created_at: string
  updated_at: string
  // JOIN時の拡張フィールド
  scenario?: Scenario
  store?: Store
}

// キット移動イベント
export interface KitTransferEvent {
  id: string
  organization_id: string
  scenario_master_id: string
  org_scenario_id?: string | null  // organization_scenarios.id
  kit_number: number
  from_store_id: string
  to_store_id: string
  transfer_date: string  // YYYY-MM-DD形式
  status: 'pending' | 'completed' | 'cancelled'
  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  // JOIN時の拡張フィールド
  scenario?: Scenario
  from_store?: Store
  to_store?: Store
}

// キット移動提案（最適化アルゴリズムの出力）
export interface KitTransferSuggestion {
  scenario_master_id: string
  org_scenario_id?: string  // organization_scenarios.id
  scenario_title: string
  kit_number: number
  from_store_id: string
  from_store_name: string
  to_store_id: string
  to_store_name: string
  transfer_date: string
  performance_date: string  // 実際の公演日
  reason: string  // 移動理由（例: "2/3に新宿店で公演予定"）
}

// 週間キット需要（日×店舗×シナリオ）
export interface KitDemand {
  date: string
  store_id: string
  store_name: string
  scenario_master_id: string
  scenario_title: string
  event_count: number  // その日のその店舗でのそのシナリオの公演数
}

// キット移動完了状態
export interface KitTransferCompletion {
  id: string
  organization_id: string
  scenario_master_id: string
  org_scenario_id?: string  // organization_scenarios.id
  kit_number: number
  performance_date: string  // YYYY-MM-DD形式
  from_store_id: string
  to_store_id: string
  picked_up_at: string | null
  picked_up_by: string | null
  delivered_at: string | null
  delivered_by: string | null
  created_at: string
  updated_at: string
  // JOIN時の拡張フィールド
  picked_up_by_staff?: { id: string; name: string | null }
  delivered_by_staff?: { id: string; name: string | null }
}
