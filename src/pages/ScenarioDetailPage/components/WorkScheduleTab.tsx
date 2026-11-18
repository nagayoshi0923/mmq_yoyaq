import { useMemo, useState } from 'react'
import type { EventSchedule } from '../utils/types'
import { isWeekendOrHoliday } from '../utils/pricingUtils'
import { formatJstMonthDay } from '@/utils/jstDate'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { seatsLabel } from '@/components/renewal/labels'
import { cn } from '@/lib/utils'

interface StoreOption {
  id: string
  name: string
  short_name?: string
}

type TimeFilter = 'all' | 'day' | 'night'

interface WorkScheduleTabProps {
  events: EventSchedule[]
  stores: StoreOption[]
  /** 空 = すべての店舗 */
  storeFilter: string[]
  onStoreFilterChange: (ids: string[]) => void
  selectedEventId: string | null
  onSelect: (eventId: string | null) => void
  participantCount: number
  onParticipantCountChange: (count: number) => void
  maxParticipants: number
  isCustomHoliday?: (date: string) => boolean
  /** 選んだ行・チップの色（組織のテーマ色） */
  accent: string
}

const FIRST_DATES = 6

/** 夜の回（17時以降に始まる回） */
function isNightStart(startTime: string): boolean {
  return startTime.slice(0, 5) >= '17:00'
}

/**
 * 作品ページ「公演に参加する」: 店舗チップ・土日祝/昼夜の絞り込み・日付ごとの回の行・人数
 * （貸切の候補日を選ぶ画面と同じ並び）
 */
export function WorkScheduleTab({
  events,
  stores,
  storeFilter,
  onStoreFilterChange,
  selectedEventId,
  onSelect,
  participantCount,
  onParticipantCountChange,
  maxParticipants,
  isCustomHoliday,
  accent,
}: WorkScheduleTabProps) {
  const [weekendOnly, setWeekendOnly] = useState(false)
  const [time, setTime] = useState<TimeFilter>('all')
  const [showFull, setShowFull] = useState(true)
  const [showAllDates, setShowAllDates] = useState(false)

  const isStoreOn = (id: string) => storeFilter.length === 0 || storeFilter.includes(id)
  const toggleStore = (id: string) => {
    const current = storeFilter.length === 0 ? stores.map((s) => s.id) : storeFilter
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    if (next.length === 0) return // 全部は外さない（何も出なくなるため）
    onStoreFilterChange(next.length === stores.length ? [] : next)
  }

  const visible = useMemo(() => events.filter((e) => {
    // 店舗未紐付け（出張公演など）は店舗で絞っても残す
    if (storeFilter.length > 0 && e.store_id && !storeFilter.includes(e.store_id)) return false
    if (weekendOnly && !isWeekendOrHoliday(e.date, isCustomHoliday)) return false
    if (time === 'day' && isNightStart(e.start_time)) return false
    if (time === 'night' && !isNightStart(e.start_time)) return false
    if (!showFull && e.available_seats <= 0 && e.event_id !== selectedEventId) return false
    return true
  }), [events, storeFilter, weekendOnly, time, showFull, isCustomHoliday, selectedEventId])

  const byDate = useMemo(() => {
    const map = new Map<string, EventSchedule[]>()
    for (const e of visible) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visible])
  const shownDates = showAllDates ? byDate : byDate.slice(0, FIRST_DATES)

  const selectedEvent = selectedEventId ? events.find((e) => e.event_id === selectedEventId) : null
  const seatsLeft = selectedEvent ? Math.max(0, (selectedEvent.max_participants || maxParticipants) - (selectedEvent.current_participants || 0)) : maxParticipants
  const countMax = Math.max(1, Math.min(seatsLeft || maxParticipants, maxParticipants))

  return (
    <div data-testid="work-schedule-tab">
      <h2 className="text-lg font-bold">公演の日程</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">近い順に並んでいます。参加したい回を選んでください</p>

      {stores.length > 1 && (
        <div className="mt-4">
          <p className="text-sm font-bold">店舗</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stores.map((s) => {
              const on = isStoreOn(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStore(s.id)}
                  className={cn('h-9 rounded-full border px-4 text-sm font-bold', on ? 'text-white' : 'border-gray-300 bg-white text-gray-500')}
                  style={on ? { backgroundColor: accent, borderColor: accent } : undefined}
                >
                  {on && '✓ '}{s.short_name || s.name}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">押すと外せます。外した店舗の回は下に出ません</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-sm font-bold">日にちと時間</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <RenewalChip selected={weekendOnly} onClick={() => setWeekendOnly((v) => !v)}>土日祝だけ</RenewalChip>
          <RenewalChip selected={time === 'all'} onClick={() => setTime('all')}>すべての時間</RenewalChip>
          <RenewalChip selected={time === 'day'} onClick={() => setTime('day')}>昼</RenewalChip>
          <RenewalChip selected={time === 'night'} onClick={() => setTime('night')}>夜</RenewalChip>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={showFull} onChange={(e) => setShowFull(e.target.checked)} className="h-4 w-4" />
          満席の回も表示する
        </label>
      </div>

      {shownDates.length === 0 ? (
        <p className="mt-5 border border-gray-200 bg-gray-50 p-4 text-center text-sm text-muted-foreground">
          {events.length === 0 ? '現在予約できる公演はありません' : '条件に合う回がありません。絞り込みを外してみてください'}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {shownDates.map(([date, list]) => (
            <section key={date}>
              <h3 className="border-b-2 border-gray-900 pb-1.5 text-sm font-bold">{formatJstMonthDay(date, true)}</h3>
              <ul>
                {list.map((e) => {
                  const selected = e.event_id === selectedEventId
                  const full = e.available_seats <= 0
                  return (
                    <li key={e.event_id}>
                      <button
                        type="button"
                        data-event-id={e.event_id}
                        aria-pressed={selected}
                        onClick={() => onSelect(selected ? null : e.event_id)}
                        className={cn('flex min-h-12 w-full items-center gap-3 border-b border-gray-200 px-2 text-left', full && !selected && 'text-gray-400')}
                        style={selected ? { backgroundColor: `${accent}14` } : undefined}
                      >
                        <span
                          className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2', selected ? '' : 'border-gray-400')}
                          style={selected ? { borderColor: accent } : undefined}
                          aria-hidden="true"
                        >
                          {selected && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />}
                        </span>
                        <span className="w-14 text-base font-bold">{e.start_time.slice(0, 5)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{e.store_short_name || e.store_name || '出張公演'}</span>
                        <span className={cn('text-xs', !full && e.available_seats <= 3 && 'font-bold text-gray-900')}>
                          {full ? (selected ? 'キャンセル待ち' : '満席') : seatsLabel(e.available_seats)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {byDate.length > FIRST_DATES && (
            <button type="button" onClick={() => setShowAllDates((v) => !v)} className="w-full border border-gray-300 py-2.5 text-sm font-bold">
              {showAllDates ? '近い日だけにする' : `もっと先の日程を見る（ほか${byDate.length - FIRST_DATES}日）`}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border border-gray-200 px-4 py-3">
        <span className="text-sm font-bold">人数</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="1人減らす"
            disabled={participantCount <= 1}
            onClick={() => onParticipantCountChange(participantCount - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg disabled:opacity-40"
          >−</button>
          <span className="min-w-8 text-center text-lg font-bold" data-testid="participant-count">{participantCount}人</span>
          <button
            type="button"
            aria-label="1人増やす"
            disabled={participantCount >= countMax}
            onClick={() => onParticipantCountChange(participantCount + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg disabled:opacity-40"
          >＋</button>
        </div>
      </div>
    </div>
  )
}
