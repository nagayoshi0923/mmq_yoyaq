import { useEffect, useMemo, useState } from 'react'
import { buildTimetableDay, type PrivateBlock } from '@/lib/publicTimetable'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { addJstDays } from '@/utils/jstDate'
import { TimetableDayTable } from './TimetableDayTable'

const DAYS_PER_PAGE = 7

interface StoreListViewProps {
  /** 店舗・初心者向け・人数で絞った公演（満席を含む） */
  performances: PublicPerformance[]
  privateBlocks: PrivateBlock[]
  stores: StoreOption[]
  from: string
  maxDate: string
  people: number
  isLoading: boolean
  onSelect: (p: PublicPerformance) => void
}

/** リスト（店舗 × 朝昼夜の時間割）。期間は日付の選択の初日から 7 日、下端の「次の 7 日 ›」で延ばす */
export function StoreListView({ performances, privateBlocks, stores, from, maxDate, people, isLoading, onSelect }: StoreListViewProps) {
  const [dayCount, setDayCount] = useState(DAYS_PER_PAGE)
  useEffect(() => { setDayCount(DAYS_PER_PAGE) }, [from])
  const days = useMemo(() => {
    const list: string[] = []
    for (let i = 0; i < dayCount; i++) {
      const d = addJstDays(from, i)
      if (d > maxDate) break
      list.push(d)
    }
    return list.map((d) => buildTimetableDay(d, performances, privateBlocks, stores, people))
  }, [dayCount, from, maxDate, performances, privateBlocks, stores, people])
  const canMore = addJstDays(from, dayCount) <= maxDate

  if (isLoading && performances.length === 0) {
    return <div className="mt-2 h-40 animate-pulse rounded-lg bg-muted" aria-busy="true" />
  }
  return (
    <div className="mt-2 space-y-3">
      {days.map((day) => <TimetableDayTable key={day.date} day={day} stickyHeader onSelect={onSelect} />)}
      <p className="text-xs text-muted-foreground">「貸切」は貸切で埋まっている枠です。押すと作品ページが、その公演を選んだ状態で開きます。</p>
      {canMore && (
        <button
          type="button"
          onClick={() => setDayCount((n) => n + DAYS_PER_PAGE)}
          className="block w-full rounded-md border border-input bg-white px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          次の 7 日 ›
        </button>
      )}
    </div>
  )
}
