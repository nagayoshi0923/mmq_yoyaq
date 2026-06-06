// 公演の更新履歴を表示するタブコンポーネント

import { logger } from '@/utils/logger'
import { useState, useEffect, lazy, Suspense } from 'react'
import { format } from '@/lib/dateFns'
import { ja } from 'date-fns/locale'
import { Clock, User, ArrowRight, Plus, Trash2, Ban, RotateCcw, Eye, EyeOff, Loader2, UserPlus, UserMinus, MoveRight, MoveLeft, Copy, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  getEventHistory,
  EventHistory,
  ActionType,
  ACTION_LABELS,
  FIELD_LABELS,
  formatValue,
  formatGMsWithRoles,
  CellInfo
} from '@/lib/api/eventHistoryApi'
import { cn } from '@/lib/utils'
import { PerformanceCard } from '@/components/schedule/PerformanceCard'
import { CATEGORY_CONFIG, getReservationBadgeClass } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'
import type { Scenario, Staff as StaffType, Store } from '@/types'

// 循環依存回避のため lazy で読み込む（PerformanceModal は EventHistoryTab を含むため）
const PerformanceModalLazy = lazy(() =>
  import('@/components/schedule/PerformanceModal').then(m => ({ default: m.PerformanceModal }))
)

interface EventHistoryTabProps {
  cellInfo?: CellInfo           // セル情報（日付＋会場＋時間帯）
  organizationId?: string       // 組織ID
  stores?: Store[]              // 店舗一覧（UUID→名前解決 + スナップショットモーダル用）
  // スナップショットクリック → 読み取り専用 PerformanceModal を開くのに必要
  scenarios?: Scenario[]
  staff?: StaffType[]
}

// スナップショットが「セル描画に足る」内容を持つか判定
function isRenderableSnapshot(snapshot: Record<string, unknown> | null | undefined): boolean {
  if (!snapshot) return false
  const startTime = snapshot.start_time
  const endTime = snapshot.end_time
  return (
    typeof startTime === 'string' && startTime.length >= 5 &&
    typeof endTime === 'string' && endTime.length >= 5
  )
}

// アクション種別に応じて、ない側のプレースホルダーに出すラベル
function getPlaceholderLabel(side: 'before' | 'after', actionType: ActionType): string {
  if (side === 'before') {
    if (actionType === 'create' || actionType === 'copy' || actionType === 'move_in') {
      return '（作成前）'
    }
    return '（情報なし）'
  }
  // after
  if (actionType === 'delete') return '（削除）'
  if (actionType === 'move_out') return '（このセルから移動）'
  return '（情報なし）'
}

// snapshot レコードから PerformanceCard / PerformanceModal に渡せる ScheduleEvent を組み立てる
function reconstructEventFromSnapshot(
  snapshot: Record<string, unknown>,
  scenarios?: Scenario[]
): ScheduleEvent | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const scenarioMasterId = (snapshot.scenario_master_id as string | undefined) ?? undefined
  const scenarioMaster = scenarioMasterId
    ? scenarios?.find(s => s.id === scenarioMasterId)
    : undefined
  const maxParticipants =
    (snapshot.max_participants as number | undefined) ??
    (snapshot.capacity as number | undefined) ??
    undefined
  return {
    id: String(snapshot.id ?? ''),
    date: String(snapshot.date ?? ''),
    venue: String(snapshot.store_id ?? snapshot.venue ?? ''),
    store_id: snapshot.store_id ? String(snapshot.store_id) : undefined,
    scenario: String(snapshot.scenario ?? ''),
    scenario_master_id: scenarioMasterId,
    gms: Array.isArray(snapshot.gms) ? (snapshot.gms as string[]) : [],
    gm_roles: (snapshot.gm_roles as Record<string, string> | undefined) ?? {},
    start_time: String(snapshot.start_time ?? ''),
    end_time: String(snapshot.end_time ?? ''),
    category: (snapshot.category as ScheduleEvent['category']) ?? 'open',
    is_cancelled: Boolean(snapshot.is_cancelled),
    is_tentative: Boolean(snapshot.is_tentative),
    current_participants: (snapshot.current_participants as number | undefined) ?? 0,
    max_participants: maxParticipants,
    notes: (snapshot.notes as string | undefined) ?? undefined,
    is_reservation_enabled: Boolean(snapshot.is_reservation_enabled),
    is_private_request: Boolean(snapshot.is_private_request),
    reservation_name: (snapshot.reservation_name as string | undefined) ?? undefined,
    time_slot: (snapshot.time_slot as string | undefined) ?? undefined,
    venue_rental_fee: (snapshot.venue_rental_fee as number | undefined) ?? undefined,
    scenarios: scenarioMaster
      ? {
          id: scenarioMaster.id,
          title: scenarioMaster.title,
          player_count_max: scenarioMaster.player_count_max ?? 8,
        }
      : undefined,
  }
}

// アクションタイプに応じたアイコンを取得
function getActionIcon(actionType: ActionType) {
  switch (actionType) {
    case 'create':
      return <Plus className="h-4 w-4 text-green-600" />
    case 'update':
      return <Clock className="h-4 w-4 text-blue-600" />
    case 'delete':
      return <Trash2 className="h-4 w-4 text-red-600" />
    case 'cancel':
      return <Ban className="h-4 w-4 text-orange-600" />
    case 'restore':
      return <RotateCcw className="h-4 w-4 text-green-600" />
    case 'publish':
      return <Eye className="h-4 w-4 text-blue-600" />
    case 'unpublish':
      return <EyeOff className="h-4 w-4 text-gray-600" />
    case 'add_participant':
      return <UserPlus className="h-4 w-4 text-green-600" />
    case 'remove_participant':
      return <UserMinus className="h-4 w-4 text-red-600" />
    case 'move_out':
      return <MoveRight className="h-4 w-4 text-purple-600" />
    case 'move_in':
      return <MoveLeft className="h-4 w-4 text-purple-600" />
    case 'copy':
      return <Copy className="h-4 w-4 text-indigo-600" />
    case 'email_sent':
      return <Mail className="h-4 w-4 text-sky-600" />
    default:
      return <Clock className="h-4 w-4 text-gray-600" />
  }
}

// アクションタイプに応じたバッジスタイル
function getActionBadgeStyle(actionType: ActionType): string {
  switch (actionType) {
    case 'create':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'update':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'delete':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'cancel':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'restore':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'publish':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'unpublish':
      return 'bg-gray-100 text-gray-800 border-gray-200'
    case 'add_participant':
      return 'bg-teal-100 text-teal-800 border-teal-200'
    case 'remove_participant':
      return 'bg-pink-100 text-pink-800 border-pink-200'
    case 'move_out':
    case 'move_in':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'copy':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'email_sent':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolveStoreName(value: unknown, stores?: Store[]): string {
  if (!stores || value === null || value === undefined) return formatValue('', value)
  const str = String(value)
  if (UUID_PATTERN.test(str)) {
    return stores.find(s => s.id === str)?.name ?? str
  }
  return str
}

// 変更内容を表示するコンポーネント
function ChangeItem({ field, oldValue, newValue, allOldValues, allNewValues, stores }: {
  field: string
  oldValue: unknown
  newValue: unknown
  allOldValues?: Record<string, unknown> | null
  allNewValues?: Record<string, unknown> | null
  stores?: Store[]
}) {
  const label = FIELD_LABELS[field] || field

  // GMフィールドの場合は役割も含めて表示
  let oldStr: string
  let newStr: string

  if (field === 'gms') {
    const oldRoles = allOldValues?.gm_roles as Record<string, string> | undefined
    const newRoles = allNewValues?.gm_roles as Record<string, string> | undefined
    oldStr = formatGMsWithRoles(oldValue as string[] | null, oldRoles)
    newStr = formatGMsWithRoles(newValue as string[] | null, newRoles)
  } else if (field === 'store_id' || field === 'venue') {
    oldStr = resolveStoreName(oldValue, stores)
    newStr = resolveStoreName(newValue, stores)
  } else if (field === 'gm_roles') {
    oldStr = formatValue(field, oldValue)
    newStr = formatValue(field, newValue)
  } else {
    oldStr = formatValue(field, oldValue)
    newStr = formatValue(field, newValue)
  }
  
  return (
    <div className="flex items-start gap-1 text-[10px] py-0.5 leading-tight">
      <span className="text-muted-foreground shrink-0 w-16">{label}:</span>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-red-600 line-through">{oldStr}</span>
        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        <span className="text-green-700 font-medium">{newStr}</span>
      </div>
    </div>
  )
}

// 変更されたフィールド名のサマリーを生成
function getChangeSummary(changes: Record<string, { old: unknown; new: unknown }>): string {
  const changeKeys = Object.keys(changes)
  if (changeKeys.length === 0) return ''
  
  const labels = changeKeys.map(key => FIELD_LABELS[key] || key)
  return labels.join('、')
}

// 新規作成時のサマリーを生成
function getCreateSummary(newValues: Record<string, unknown> | null): { field: string; value: string }[] {
  if (!newValues) return []
  
  const importantFields = ['scenario', 'gms', 'start_time', 'end_time', 'category', 'reservation_name']
  const summary: { field: string; value: string }[] = []
  
  for (const field of importantFields) {
    const value = newValues[field]
    if (value !== null && value !== undefined && value !== '' && 
        !(Array.isArray(value) && value.length === 0)) {
      
      // GMフィールドの場合は役割も含めて表示
      let displayValue: string
      if (field === 'gms') {
        const gmRoles = newValues.gm_roles as Record<string, string> | undefined
        displayValue = formatGMsWithRoles(value as string[], gmRoles)
      } else {
        displayValue = formatValue(field, value)
      }
      
      summary.push({
        field: FIELD_LABELS[field] || field,
        value: displayValue
      })
    }
  }
  
  return summary
}

// 履歴エントリを表示するコンポーネント
function HistoryEntry({
  entry,
  stores,
  scenarios,
  onPreviewClick
}: {
  entry: EventHistory
  stores?: Store[]
  scenarios?: Scenario[]
  onPreviewClick?: (snapshot: Record<string, unknown>) => void
}) {
  const date = new Date(entry.created_at)
  const formattedDate = format(date, 'M/d(E) HH:mm', { locale: ja })
  const changes = entry.changes as Record<string, { old: unknown; new: unknown }>
  const changeKeys = Object.keys(changes)
  const isDeleted = entry.schedule_event_id === null
  const changeSummary = getChangeSummary(changes)
  const contentSummaryActions: ActionType[] = ['create', 'copy', 'move_in']
  const contentSummary = contentSummaryActions.includes(entry.action_type as ActionType)
    ? getCreateSummary(entry.new_values)
    : entry.action_type === 'move_out'
    ? getCreateSummary(entry.old_values)
    : []

  // 操作前 / 操作後の両セルを並べて比較する
  const beforeSnapshot = entry.old_values
  const afterSnapshot = entry.new_values
  const beforeEvent = isRenderableSnapshot(beforeSnapshot)
    ? reconstructEventFromSnapshot(beforeSnapshot!, scenarios)
    : null
  const afterEvent = isRenderableSnapshot(afterSnapshot)
    ? reconstructEventFromSnapshot(afterSnapshot!, scenarios)
    : null
  // 両側とも描画できないなら比較セクション自体を出さない
  const showComparison = !!beforeEvent || !!afterEvent

  return (
    <div className={cn(
      "border rounded-lg p-3",
      isDeleted ? "bg-red-50/50 border-red-200" : "bg-card"
    )}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {getActionIcon(entry.action_type)}
          <Badge 
            variant="outline" 
            className={cn("text-[10px] px-1.5 py-0", getActionBadgeStyle(entry.action_type))}
          >
            {ACTION_LABELS[entry.action_type]}
          </Badge>
          {/* 変更項目のサマリー */}
          {changeSummary && (
            <span className="text-[10px] text-blue-600 font-medium">
              {changeSummary}を変更
            </span>
          )}
          {isDeleted && (
            <span className="text-[10px] text-red-600">（削除済み公演）</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formattedDate}</span>
      </div>
      
      {/* 削除された公演のシナリオ名 */}
      {entry.deleted_event_scenario && (
        <div className="text-xs font-medium text-red-700 mb-2">
          シナリオ: {entry.deleted_event_scenario}
        </div>
      )}
      
      {/* 変更者 */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <User className="h-3 w-3" />
        <span>{entry.changed_by_name || '不明'}</span>
      </div>

      {/* 操作前 / 操作後のセル比較（左右に並べる、クリックで詳細モーダル） */}
      {showComparison && (
        <div className="border-t pt-2 mb-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 items-center">
            {/* 操作前 */}
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground mb-1">操作前</div>
              {beforeEvent && beforeSnapshot ? (
                <div className="border rounded">
                  <PerformanceCard
                    event={beforeEvent}
                    categoryConfig={CATEGORY_CONFIG}
                    getReservationBadgeClass={getReservationBadgeClass}
                    previewMode
                    onClick={onPreviewClick ? () => onPreviewClick(beforeSnapshot) : undefined}
                  />
                </div>
              ) : (
                <div className="border border-dashed rounded p-3 text-center text-[10px] text-muted-foreground bg-muted/30">
                  {getPlaceholderLabel('before', entry.action_type as ActionType)}
                </div>
              )}
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {/* 操作後 */}
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground mb-1">操作後</div>
              {afterEvent && afterSnapshot ? (
                <div className="border rounded">
                  <PerformanceCard
                    event={afterEvent}
                    categoryConfig={CATEGORY_CONFIG}
                    getReservationBadgeClass={getReservationBadgeClass}
                    previewMode
                    onClick={onPreviewClick ? () => onPreviewClick(afterSnapshot) : undefined}
                  />
                </div>
              ) : (
                <div className="border border-dashed rounded p-3 text-center text-[10px] text-muted-foreground bg-muted/30">
                  {getPlaceholderLabel('after', entry.action_type as ActionType)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 変更内容（詳細） */}
      {changeKeys.length > 0 ? (
        <div className="border-t pt-2 mt-2">
          {changeKeys
            // gmsが変更されている場合はgm_rolesをスキップ（GMと一緒に表示される）
            .filter(field => !(field === 'gm_roles' && changeKeys.includes('gms')))
            // store_idがある場合はvenueをスキップ（重複表示を防ぐ）
            .filter(field => !(field === 'venue' && changeKeys.includes('store_id')))
            .map((field) => (
            <ChangeItem
              key={field}
              field={field}
              oldValue={changes[field].old}
              newValue={changes[field].new}
              allOldValues={entry.old_values}
              allNewValues={entry.new_values}
              stores={stores}
            />
          ))}
        </div>
      ) : contentSummary.length > 0 ? (
        <div className="border-t pt-1.5 mt-1.5 space-y-0">
          {entry.action_type === 'move_out' && (
            <p className="text-[10px] text-red-600 mb-0.5 leading-tight">このセルから移動しました</p>
          )}
          {contentSummary.map(({ field, value }) => (
            <div key={field} className="flex items-start gap-1 text-[10px] py-0.5 leading-tight">
              <span className="text-muted-foreground shrink-0 w-16">{field}:</span>
              <span className={entry.action_type === 'move_out' ? 'text-red-400 line-through' : 'text-green-700 font-medium'}>{value}</span>
            </div>
          ))}
        </div>
      ) : entry.action_type === 'create' ? (
        <div className="text-xs text-muted-foreground pt-1">
          公演が作成されました
        </div>
      ) : entry.action_type === 'delete' ? (
        <div className="text-xs text-red-600 pt-1">
          公演が削除されました
        </div>
      ) : null}
      
      {/* 補足情報（移動元・複製元など） */}
      {entry.notes && (
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
          {(['move_out', 'move_in'] as ActionType[]).includes(entry.action_type as ActionType)
            ? entry.action_type === 'move_out' ? `移動先: ${entry.notes.replace(/^→\s*/, '')}` : `移動元: ${entry.notes.replace(/^←\s*/, '')}`
            : entry.action_type === 'copy' ? `複製元: ${entry.notes.replace(/^←\s*/, '').replace(/\s*から(複製|ペースト)$/, '')}`
            : entry.notes}
        </div>
      )}
    </div>
  )
}

export function EventHistoryTab({ cellInfo, organizationId, stores, scenarios, staff }: EventHistoryTabProps) {
  const [history, setHistory] = useState<EventHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // クリックされたスナップショットを読み取り専用 PerformanceModal で開く
  const [snapshotEvent, setSnapshotEvent] = useState<ScheduleEvent | null>(null)

  // スナップショットクリック時に ScheduleEvent を組み立てて読み取り専用モーダルを開く
  // scenarios が無いと PerformanceModal が満足に動かないので、scenarios プロップが渡されているときのみ有効
  const handlePreviewClick = scenarios
    ? (snapshot: Record<string, unknown>) => {
        const event = reconstructEventFromSnapshot(snapshot, scenarios)
        if (event) setSnapshotEvent(event)
      }
    : undefined

  useEffect(() => {
    async function fetchHistory() {
      if (!cellInfo) {
        setHistory([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const data = await getEventHistory(cellInfo, organizationId)
        setHistory(data)
      } catch (err) {
        logger.error('履歴取得エラー:', err)
        setError('履歴の取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [cellInfo, organizationId])

  if (!cellInfo) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        公演を保存すると履歴が表示されます
      </div>
    )
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-500 text-sm">
        {error}
      </div>
    )
  }
  
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p>履歴がありません</p>
        <p className="text-xs mt-1">変更が行われると履歴が記録されます</p>
      </div>
    )
  }
  
  return (
    <>
      <div className="space-y-3">
        {history.map((entry) => (
          <HistoryEntry
            key={entry.id}
            entry={entry}
            stores={stores}
            scenarios={scenarios}
            onPreviewClick={handlePreviewClick}
          />
        ))}
      </div>

      {/* スナップショットの読み取り専用モーダル（クリック時のみ表示） */}
      {snapshotEvent && scenarios && (
        <Suspense fallback={null}>
          <PerformanceModalLazy
            isOpen={!!snapshotEvent}
            onClose={() => setSnapshotEvent(null)}
            onSave={async () => false}
            mode="edit"
            event={snapshotEvent}
            stores={stores ?? []}
            scenarios={scenarios}
            staff={staff ?? []}
            readOnly
          />
        </Suspense>
      )}
    </>
  )
}

