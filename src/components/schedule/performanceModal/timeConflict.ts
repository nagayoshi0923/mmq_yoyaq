/**
 * 入力中の時間が、同じ店舗・同じ日の既存公演と「重複／間隔不足」になっているか（保存前の見える化）。
 * 保存時と同じ準備時間込みの判定（checkTimeOverlapWithPreparation）を使う。重複が見つかればそれを優先して返す。
 * PerformanceModal.tsx から規則を変えずに切り出したもの。
 */
import { checkTimeOverlapWithPreparation } from '@/utils/eventOperationUtils'
import type { ScheduleEvent } from '@/types/schedule'
import type { PreparationContext } from '../../../../supabase/functions/_shared/preparation-settings'

export type TimeConflict = { kind: 'overlap' | 'interval'; reason: string; event: ScheduleEvent }

export function findTimeConflict({ form, events, scenarios, editingEventId, preparationReady, resolvePreparation }: {
  form: { is_private_request?: boolean; start_time: string; end_time: string; date: string; venue: string; scenario: string }
  events: ScheduleEvent[]
  scenarios: Array<{ id: string; title: string }>
  /** 編集中の公演（自分自身とは比べない） */
  editingEventId?: string
  preparationReady: boolean
  resolvePreparation: (context: PreparationContext) => number | undefined
}): TimeConflict | null {
  if (form.is_private_request) return null // 貸切は日時変更不可
  if (!form.start_time || !form.end_time || !form.date || !form.venue) return null
  if (!preparationReady) return null
  const newScenario = scenarios.find(s => s.title === form.scenario)
  const newPrep = resolvePreparation({ storeId: form.venue, scenarioId: newScenario?.id, eventId: editingEventId })!
  let best: TimeConflict | null = null
  for (const ev of events) {
    if (editingEventId && ev.id === editingEventId) continue
    if (ev.date !== form.date || ev.venue !== form.venue || ev.is_cancelled) continue
    if (!ev.start_time || !ev.end_time) continue
    const exPrep = resolvePreparation({ storeId: ev.store_id || ev.venue, scenarioId: scenarios.find(s => s.title === ev.scenario)?.id, eventId: ev.id })!
    const r = checkTimeOverlapWithPreparation(ev.start_time, ev.end_time, form.start_time, form.end_time, exPrep, newPrep)
    if (r.overlap) {
      const kind: 'overlap' | 'interval' = r.reason === '時間が重複' ? 'overlap' : 'interval'
      if (kind === 'overlap') { best = { kind, reason: r.reason || '時間が重複', event: ev }; break }
      if (!best) best = { kind, reason: r.reason || '間隔不足', event: ev }
    }
  }
  return best
}
