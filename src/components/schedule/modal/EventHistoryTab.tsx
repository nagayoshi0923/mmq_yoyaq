// 公演の更新履歴を表示するタブコンポーネント

import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Clock, User, ArrowRight, Plus, Trash2, Ban, RotateCcw, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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

interface EventHistoryTabProps {
  eventId: string | undefined
  cellInfo?: CellInfo           // セル情報（削除された履歴を取得するため）
  organizationId?: string       // 組織ID
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
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

// 変更内容を表示するコンポーネント
function ChangeItem({ field, oldValue, newValue, allOldValues, allNewValues }: { 
  field: string
  oldValue: unknown
  newValue: unknown
  allOldValues?: Record<string, unknown> | null
  allNewValues?: Record<string, unknown> | null
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
  } else if (field === 'gm_roles') {
    // gm_rolesは個別に表示（GMと一緒に表示されるのでスキップ可能にする）
    oldStr = formatValue(field, oldValue)
    newStr = formatValue(field, newValue)
  } else {
    oldStr = formatValue(field, oldValue)
    newStr = formatValue(field, newValue)
  }
  
  return (
    <div className="flex items-start gap-2 text-xs py-1">
      <span className="text-muted-foreground shrink-0 w-20">{label}:</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-red-600 line-through">{oldStr}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
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
function HistoryEntry({ entry }: { entry: EventHistory }) {
  const date = new Date(entry.created_at)
  const formattedDate = format(date, 'M/d(E) HH:mm', { locale: ja })
  const changes = entry.changes as Record<string, { old: unknown; new: unknown }>
  const changeKeys = Object.keys(changes)
  const isDeleted = entry.schedule_event_id === null
  const changeSummary = getChangeSummary(changes)
  const createSummary = entry.action_type === 'create' ? getCreateSummary(entry.new_values) : []
  
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
      
      {/* 変更内容（詳細） */}
      {changeKeys.length > 0 ? (
        <div className="border-t pt-2 mt-2">
          {changeKeys
            // gmsが変更されている場合はgm_rolesをスキップ（GMと一緒に表示される）
            .filter(field => !(field === 'gm_roles' && changeKeys.includes('gms')))
            .map((field) => (
            <ChangeItem 
              key={field}
              field={field}
              oldValue={changes[field].old}
              newValue={changes[field].new}
              allOldValues={entry.old_values}
              allNewValues={entry.new_values}
            />
          ))}
        </div>
      ) : entry.action_type === 'create' && createSummary.length > 0 ? (
        <div className="border-t pt-2 mt-2 space-y-1">
          {createSummary.map(({ field, value }) => (
            <div key={field} className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0 w-20">{field}:</span>
              <span className="text-green-700 font-medium">{value}</span>
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
      
      {/* メモ */}
      {entry.notes && (
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
          メモ: {entry.notes}
        </div>
      )}
    </div>
  )
}

export function EventHistoryTab({ eventId, cellInfo, organizationId }: EventHistoryTabProps) {
  const [history, setHistory] = useState<EventHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    async function fetchHistory() {
      // イベントIDもセル情報もない場合
      if (!eventId && !cellInfo) {
        setHistory([])
        setIsLoading(false)
        return
      }
      
      setIsLoading(true)
      setError(null)
      
      try {
        // セル情報がある場合は、削除された公演の履歴も含めて取得
        const data = await getEventHistory(eventId, cellInfo, organizationId)
        setHistory(data)
      } catch (err) {
        logger.error('履歴取得エラー:', err)
        setError('履歴の取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchHistory()
  }, [eventId, cellInfo, organizationId])
  
  // 新規作成時でもセル情報があれば過去の履歴を表示
  if (!eventId && !cellInfo) {
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
    <ScrollArea className="h-[400px] pr-3">
      <div className="space-y-3">
        {history.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </ScrollArea>
  )
}

