// 公演の更新履歴を管理するAPI

import { supabase } from '@/lib/supabase'
import { getCurrentStaff, getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

// 変更アクションの種類
export type ActionType = 
  | 'create'              // 新規作成
  | 'update'              // 更新
  | 'delete'              // 削除
  | 'cancel'              // 中止
  | 'restore'             // 復活
  | 'publish'             // 公開
  | 'unpublish'           // 非公開
  | 'add_participant'     // 参加者追加
  | 'remove_participant'  // 参加者削除

// 履歴エントリの型定義
export interface EventHistory {
  id: string
  schedule_event_id: string | null  // 削除後はNULL
  organization_id: string
  event_date: string      // セル情報：日付
  store_id: string        // セル情報：店舗ID
  time_slot: string | null // セル情報：時間帯
  changed_by_user_id: string | null
  changed_by_staff_id: string | null
  changed_by_name: string | null
  action_type: ActionType
  changes: Record<string, { old: unknown; new: unknown }>
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  deleted_event_scenario: string | null  // 削除された公演のシナリオ名
  notes: string | null
  created_at: string
}

// セル情報の型定義
export interface CellInfo {
  date: string
  storeId: string
  timeSlot: string | null
}

// フィールド名の日本語マッピング
export const FIELD_LABELS: Record<string, string> = {
  date: '日付',
  venue: '店舗',
  store_id: '店舗',
  scenario: 'シナリオ',
  scenario_id: 'シナリオID',
  gms: 'GM',
  gm_roles: 'GM役割',
  start_time: '開始時間',
  end_time: '終了時間',
  category: 'カテゴリ',
  capacity: '最大参加者数',
  notes: '備考',
  is_cancelled: '中止状態',
  is_tentative: '仮状態',
  is_reservation_enabled: '予約受付',
  reservation_name: '予約者名',
  time_slot: '時間帯',
  venue_rental_fee: '場所貸し料金',
}

// アクション名の日本語マッピング
export const ACTION_LABELS: Record<ActionType, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  cancel: '中止',
  restore: '復活',
  publish: '公開',
  unpublish: '非公開',
  add_participant: '参加者追加',
  remove_participant: '参加者削除',
}

/**
 * 2つのオブジェクトの差分を計算
 */
function calculateChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  
  // 比較対象のフィールド（重要なフィールドのみ）
  // DBカラム名と一致させること（capacity, store_idなど）
  const fieldsToCompare = [
    'date', 'venue', 'store_id', 'scenario', 'scenario_id',
    'gms', 'gm_roles', 'start_time', 'end_time',
    'category', 'capacity', 'notes',
    'is_cancelled', 'is_tentative', 'is_reservation_enabled',
    'reservation_name', 'time_slot', 'venue_rental_fee'
  ]
  
  for (const field of fieldsToCompare) {
    const oldVal = oldValues?.[field]
    const newVal = newValues[field]
    
    // 値が異なる場合のみ記録
    const oldStr = JSON.stringify(oldVal ?? null)
    const newStr = JSON.stringify(newVal ?? null)
    
    if (oldStr !== newStr) {
      changes[field] = { old: oldVal ?? null, new: newVal ?? null }
    }
  }
  
  return changes
}

/**
 * 履歴エントリを作成
 */
export async function createEventHistory(
  scheduleEventId: string | null,
  organizationId: string,
  actionType: ActionType,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown>,
  cellInfo: CellInfo,
  options?: {
    notes?: string
    deletedEventScenario?: string
  }
): Promise<void> {
  try {
    // 現在のスタッフ情報を取得
    const currentStaff = await getCurrentStaff()
    const { data: { user } } = await supabase.auth.getUser()
    
    // 変更差分を計算
    const changes = actionType === 'create' 
      ? {} // 新規作成時は差分なし
      : calculateChanges(oldValues, newValues)
    
    // 変更がない場合はスキップ（新規作成・削除以外）
    if (actionType !== 'create' && actionType !== 'delete' && Object.keys(changes).length === 0) {
      logger.log('変更がないため履歴をスキップ')
      return
    }
    
    const historyEntry = {
      schedule_event_id: scheduleEventId,
      organization_id: organizationId,
      event_date: cellInfo.date,
      store_id: cellInfo.storeId,
      time_slot: cellInfo.timeSlot,
      changed_by_user_id: user?.id || null,
      changed_by_staff_id: currentStaff?.id || null,
      changed_by_name: currentStaff?.name || user?.email || '不明',
      action_type: actionType,
      changes,
      old_values: oldValues,
      new_values: newValues,
      deleted_event_scenario: options?.deletedEventScenario || null,
      notes: options?.notes || null,
    }
    
    const { data, error } = await supabase
      .from('schedule_event_history')
      .insert(historyEntry)
      .select()
      .single()
    
    if (error) {
      logger.error('履歴作成エラー:', error)
      // 履歴作成の失敗は本体処理に影響させない
    } else {
      logger.log('履歴を作成しました:', { scheduleEventId, actionType })
    }
  } catch (error) {
    logger.error('履歴作成中のエラー:', error)
    // 履歴作成の失敗は本体処理に影響させない
  }
}

/**
 * イベントの履歴を取得
 * セルベースで全履歴を取得（現在の公演 + 過去に削除された公演すべて）
 */
export async function getEventHistory(
  scheduleEventId: string | undefined,
  cellInfo?: CellInfo,
  organizationId?: string
): Promise<EventHistory[]> {
  const allHistory: EventHistory[] = []
  const seenIds = new Set<string>()
  
  // 1. セル情報がある場合、そのセルの全履歴を取得（メイン）
  if (cellInfo && organizationId) {
    // time_slotがnullの場合は.is()を使う、それ以外は.eq()を使う
    let query = supabase
      .from('schedule_event_history')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('event_date', cellInfo.date)
      .eq('store_id', cellInfo.storeId)
    
    if (cellInfo.timeSlot === null) {
      query = query.is('time_slot', null)
    } else {
      query = query.eq('time_slot', cellInfo.timeSlot)
    }
    
    const { data: cellHistory, error: cellError } = await query.order('created_at', { ascending: false })
    
    if (cellError) {
      logger.error('セル履歴取得エラー:', cellError)
    } else if (cellHistory) {
      for (const h of cellHistory) {
        if (!seenIds.has(h.id)) {
          seenIds.add(h.id)
          allHistory.push(h as EventHistory)
        }
      }
    }
  }
  
  // 2. 現在の公演IDがある場合、その公演の履歴も取得（重複を防ぐ）
  //    ※セル情報が古い形式で保存されていない場合に備えて
  if (scheduleEventId) {
    // 組織フィルタ（マルチテナント対応）
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let eventQuery = supabase
      .from('schedule_event_history')
      .select('*')
      .eq('schedule_event_id', scheduleEventId)
      .order('created_at', { ascending: false })
    
    if (orgId) {
      eventQuery = eventQuery.eq('organization_id', orgId)
    }
    
    const { data: eventHistory, error: eventError } = await eventQuery
    
    if (eventError) {
      logger.error('公演履歴取得エラー:', eventError)
    } else if (eventHistory) {
      for (const h of eventHistory) {
        if (!seenIds.has(h.id)) {
          seenIds.add(h.id)
          allHistory.push(h as EventHistory)
        }
      }
    }
  }
  
  // 日時順にソート（新しい順）
  allHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  
  return allHistory
}

// GM役割の日本語ラベル
const GM_ROLE_LABELS: Record<string, string> = {
  main: 'メイン',
  sub: 'サブ',
  reception: '受付',
  staff: '参加',
  observer: '見学',
}

/**
 * GMリストと役割を組み合わせて表示用文字列を生成
 */
export function formatGMsWithRoles(
  gms: string[] | null | undefined, 
  gmRoles: Record<string, string> | null | undefined
): string {
  if (!gms || gms.length === 0) return '（なし）'
  
  return gms.map(gm => {
    const role = gmRoles?.[gm]
    if (role && role !== 'main') {
      const roleLabel = GM_ROLE_LABELS[role] || role
      return `${gm}(${roleLabel})`
    }
    return gm
  }).join(', ')
}

/**
 * 値を人間が読める形式に変換
 */
export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '（なし）'
  }
  
  // 配列の場合
  if (Array.isArray(value)) {
    if (value.length === 0) return '（なし）'
    return value.join(', ')
  }
  
  // gm_rolesの場合（役割を日本語で表示）
  if (field === 'gm_roles' && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, string>)
    if (entries.length === 0) return '（なし）'
    return entries.map(([name, role]) => {
      const roleLabel = GM_ROLE_LABELS[role] || role
      return `${name}(${roleLabel})`
    }).join(', ')
  }
  
  // その他のオブジェクトの場合
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '（なし）'
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  
  // ブール値
  if (typeof value === 'boolean') {
    if (field === 'is_cancelled') return value ? '中止' : '実施'
    if (field === 'is_tentative') return value ? '仮' : '確定'
    if (field === 'is_reservation_enabled') return value ? '受付中' : '受付停止'
    return value ? 'はい' : 'いいえ'
  }
  
  // カテゴリの場合
  if (field === 'category') {
    const categoryLabels: Record<string, string> = {
      open: 'オープン公演',
      private: '貸切公演',
      gmtest: 'GMテスト',
      testplay: 'テストプレイ',
      offsite: '出張公演',
      venue_rental: '場所貸し',
      venue_rental_free: '場所貸し無料',
      package: 'パッケージ会',
      mtg: 'MTG',
    }
    return categoryLabels[value as string] || String(value)
  }
  
  // 時間の場合（HH:MM:SS → HH:MM）
  if (field === 'start_time' || field === 'end_time') {
    return String(value).slice(0, 5)
  }
  
  return String(value)
}

