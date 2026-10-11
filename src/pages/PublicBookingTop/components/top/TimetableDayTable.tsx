import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import { hhmm, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { TIMETABLE_SLOTS, timetableSeatTone, type TimetableCell, type TimetableDay } from '@/lib/publicTimetable'
import { formatJstMonthDay, getJstWeekdayIndex } from '@/utils/jstDate'
import { cn } from '@/lib/utils'

const TONE_CLASS = { open: 'text-emerald-700', few: 'text-red-700', full: 'text-muted-foreground' } as const

function seatLabel(p: PublicPerformance): string {
  return p.available_seats > 0 ? `残 ${p.available_seats}` : '満席'
}

function Cell({ cell, onSelect }: { cell: TimetableCell; onSelect: (p: PublicPerformance) => void }) {
  if (cell.kind === 'private') {
    return <div className="rounded-md bg-muted px-1 py-2 text-center text-xs text-muted-foreground">貸切</div>
  }
  const p = cell.performance
  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      className="flex w-full min-w-0 items-center gap-1 rounded-md border border-border bg-white p-1 text-left text-xs hover:bg-muted/40"
    >
      <KeyVisualThumb src={p.key_visual_url} alt="" seed={p.scenario_id} width={60} className="aspect-[3/4] w-5 shrink-0 rounded-sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-muted-foreground">{hhmm(p.start_time)}</span>
        <span className="block truncate font-bold" title={p.title}>{p.title}</span>
        <span className={cn('block', TONE_CLASS[timetableSeatTone(p.available_seats)])}>{seatLabel(p)}</span>
      </span>
    </button>
  )
}

interface TimetableDayTableProps {
  day: TimetableDay
  /** 見出しを上に固定する（リスト） */
  stickyHeader?: boolean
  onSelect: (p: PublicPerformance) => void
}

/** 1 日分の時間割（店舗 × 朝／昼／夜）。リストとカレンダーの選んだ日で共通 */
export function TimetableDayTable({ day, stickyHeader = false, onSelect }: TimetableDayTableProps) {
  const w = getJstWeekdayIndex(day.date)
  return (
    <section aria-label={`${formatJstMonthDay(day.date, true)} の公演`}>
      <div className={cn('flex items-baseline justify-between border-b border-border bg-white px-1 py-2', stickyHeader && 'sticky top-0 z-10')}>
        <span className={cn('text-sm font-bold', w === 0 && 'text-red-600', w === 6 && 'text-blue-600')}>{formatJstMonthDay(day.date, true)}</span>
        <span className="text-xs text-muted-foreground">{day.total > 0 ? `公演 ${day.total} 件・空席あり ${day.open} 件` : '公演なし'}</span>
      </div>
      {day.rows.length > 0 && (
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="w-16 px-1 py-1 text-left font-normal md:w-28">店舗</th>
              {TIMETABLE_SLOTS.map((s) => <th key={s.key} className="px-0.5 py-1 font-normal">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {day.rows.map((row) => (
              <tr key={row.store_id} className="border-t border-border/60 align-top">
                <th scope="row" className="break-words px-1 py-1.5 text-left text-xs font-bold">{row.label}</th>
                {TIMETABLE_SLOTS.map((s) => (
                  <td key={s.key} className="p-0.5">
                    {row.slots[s.key].length === 0
                      ? <div className="py-2 text-center text-muted-foreground/50">–</div>
                      : <div className="flex flex-col gap-0.5">{row.slots[s.key].map((cell, i) => <Cell key={i} cell={cell} onSelect={onSelect} />)}</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {day.hidden_store_count > 0 && day.rows.length > 0 && (
        <p className="px-1 py-1 text-xs text-muted-foreground">ほか {day.hidden_store_count} 店舗は公演なし</p>
      )}
    </section>
  )
}
