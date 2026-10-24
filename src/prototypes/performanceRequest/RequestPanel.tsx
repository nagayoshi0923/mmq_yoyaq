/**
 * スケジュール管理の横に出す「開催リクエスト」のパネル（試作）。
 * 選んでいる店舗・表示中の月に合う希望を作品ごとに出す。日付の指定が無い希望は「日程未指定」に残す。
 * ここに出る人数は「参加希望人数」。公演の予約人数・残席・成立人数には加えない。
 */
import { CalendarPlus, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { findProtoScenario, findProtoStore } from './fixtures'
import {
  REQUEST_STATUS_LABEL, WEEKDAY_LABELS, describePeriod, formatDateLabel, formatMonthLabel,
  type RequestGroup, type RequestStatus,
} from './model'

interface RequestPanelProps {
  month: string
  groups: RequestGroup[]
  statuses: Record<string, RequestStatus>
  onStatusChange: (scenarioId: string, status: RequestStatus) => void
  onCreatePerformance: (group: RequestGroup) => void
  storeFilterLabel: string
}

const STATUS_ORDER: RequestStatus[] = ['open', 'considering', 'published']
const STATUS_TONE: Record<RequestStatus, string> = {
  open: 'border-slate-400 bg-slate-700 text-white',
  considering: 'border-amber-500 bg-amber-500 text-white',
  published: 'border-green-600 bg-green-600 text-white',
}

export function RequestPanel({ month, groups, statuses, onStatusChange, onCreatePerformance, storeFilterLabel }: RequestPanelProps) {
  return (
    <aside aria-label="開催リクエスト" className="space-y-3" data-testid="proto-request-panel">
      <div className="rounded-lg border border-dashed border-teal-400 bg-teal-50/60 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-teal-900"><Inbox className="h-4 w-4" aria-hidden />開催リクエスト</p>
        <p className="text-xs text-teal-900">{formatMonthLabel(month)}／{storeFilterLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">お客様の開催の希望です（予約ではありません）。参加希望人数は予約人数・残席に入りません。カレンダーの公演には混ぜていません。</p>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-lg border bg-background p-4 text-center text-xs text-muted-foreground">この月・店舗に合う開催リクエストはありません。</p>
      ) : groups.map((group) => {
        const scenario = findProtoScenario(group.scenarioId)
        const status = statuses[group.scenarioId] ?? 'open'
        const weekdays = Object.entries(group.weekdayCounts).sort((a, b) => b[1] - a[1])
        return (
          <article key={group.scenarioId} className="space-y-2 rounded-lg border bg-background p-3" data-testid="proto-request-group">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{scenario?.title ?? group.scenarioId}</h3>
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs ${STATUS_TONE[status]}`}>{REQUEST_STATUS_LABEL[status]}</span>
            </div>
            <dl className="grid grid-cols-2 gap-1 text-xs">
              <div className="rounded-md bg-muted/60 px-2 py-1"><dt className="text-muted-foreground">希望件数</dt><dd className="text-sm font-semibold">{group.requestCount}件</dd></div>
              <div className="rounded-md bg-muted/60 px-2 py-1"><dt className="text-muted-foreground">参加希望人数</dt><dd className="text-sm font-semibold">{group.desiredParticipants}人</dd></div>
            </dl>
            <div className="space-y-0.5 text-xs">
              <p><span className="text-muted-foreground">希望の日付: </span>{group.requestedDates.length > 0 ? group.requestedDates.map(formatDateLabel).join('・') : 'なし'}</p>
              <p><span className="text-muted-foreground">希望の曜日: </span>{weekdays.length > 0 ? weekdays.map(([w, c]) => `${WEEKDAY_LABELS[Number(w)]}×${c}`).join('・') : '指定なし'}</p>
              <p><span className="text-muted-foreground">希望店舗: </span>{group.storeIds.length ? group.storeIds.map((id) => findProtoStore(id)?.short_name ?? id).join('・') : '店舗指定なし（組織の上演可能店舗で検討）'}</p>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">内訳（日付あり {group.dated.length}件／日程未指定 {group.unscheduled.length}件）</summary>
              <ul className="mt-1 space-y-1">
                {group.dated.map((r) => (
                  <li key={r.id} className="rounded-md bg-muted/40 px-2 py-1">{r.participants}人／{describePeriod(r)}</li>
                ))}
                {group.unscheduled.map((r) => (
                  <li key={r.id} className="rounded-md bg-muted/40 px-2 py-1" data-testid="proto-unscheduled">
                    <span className="mr-1 rounded-md border border-slate-300 px-1">日程未指定</span>{r.participants}人／{describePeriod(r)}
                  </li>
                ))}
              </ul>
            </details>
            <div className="flex flex-wrap gap-1" role="group" aria-label="対応の状態（試作）">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => onStatusChange(group.scenarioId, s)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${status === s ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                >
                  {REQUEST_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <Button type="button" size="md" className="w-full gap-1" onClick={() => onCreatePerformance(group)}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />公演を作成
            </Button>
          </article>
        )
      })}
      <p className="text-xs text-muted-foreground">試作: 状態の切り替えは{'このブラウザの中だけ'}に保存します。お客様への連絡はしません。</p>
    </aside>
  )
}
