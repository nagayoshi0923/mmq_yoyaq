import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react'
import { formatJstYmd } from '@/utils/jstDate'
import { ConfirmDialog } from '@/components/patterns/modal'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

export interface AdjustmentEntry {
  id: string
  date: string
  type: 'income' | 'expense'
  amount: number
  category: string
  description?: string | null
  schedule_event_id?: string | null
  store_id?: string | null
}

interface AdjustmentListCardProps {
  entries: AdjustmentEntry[]
  // schedule_event_id -> 公演名 の対応（あれば紐づく公演名を表示）
  eventNameById: Record<string, string>
  onAdd: () => void
  onDeleted: () => void
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)

const AdjustmentListCardBase: React.FC<AdjustmentListCardProps> = ({
  entries,
  eventNameById,
  onAdd,
  onDeleted
}) => {
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // 調整が 0 件なら見出しごと非表示（追加は公演行 or 概要側の別導線からも可能）
  if (entries.length === 0) return null

  const runDelete = async () => {
    if (!deleteTargetId) return
    try {
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .delete()
        .eq('id', deleteTargetId)
      if (error) throw error
      showToast.success('収支調整を削除しました')
      onDeleted()
    } catch (error) {
      logger.error('収支調整の削除エラー:', error)
      showToast.error('削除に失敗しました')
    }
  }

  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
          <h2>収支調整</h2>
          <span className="text-xs text-muted-foreground">({entries.length}件)</span>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          調整を追加
        </Button>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {entries.map((entry) => {
          const eventName = entry.schedule_event_id ? eventNameById[entry.schedule_event_id] : undefined
          const signedAmount = `${entry.type === 'income' ? '+' : '-'}${formatCurrency(entry.amount)}`
          return (
            <article
              key={entry.id}
              className="border rounded-lg p-2 sm:p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {formatJstYmd(entry.date)}
                    </Badge>
                    <Badge variant={entry.type === 'income' ? 'success' : 'destructive'} className="text-xs">
                      {entry.type === 'income' ? '収入' : '支出'}
                    </Badge>
                    {eventName && (
                      <span className="text-xs text-muted-foreground truncate">{eventName}</span>
                    )}
                  </div>
                  {entry.description && (
                    <p className="text-sm break-words">{entry.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className={`text-sm ${entry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {signedAmount}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    title="削除"
                    onClick={() => setDeleteTargetId(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
        title="この収支調整を削除しますか？"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={runDelete}
      />
    </section>
  )
}

export const AdjustmentListCard = React.memo(AdjustmentListCardBase)
