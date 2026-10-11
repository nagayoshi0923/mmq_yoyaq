import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronRight } from 'lucide-react'
import { BookingFilters } from './BookingFilters'
import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { isPublicRegularStore, storeDisplayName } from '@/lib/publicStoreName'
import { startTimeToEn, type TimeSlotEn } from '@/lib/timeSlot'
import { cn } from '@/lib/utils'
import { formatDateJST } from '@/utils/dateUtils'
import { scenarioCardId, type EnrichedPublicEvent, type PublicCalendarEvent, type PublicEventRow, type PublicStoreRow, type ScenarioCard } from '../hooks/useBookingData'

interface ListViewData {
  date: number
  store: PublicStoreRow
}

interface ListViewProps {
  listViewMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  /** 元の部品との互換（使わない） */
  stores?: PublicStoreRow[]
  /** お客様向けの店舗名にした店舗の選択肢 */
  storeOptions: StoreOption[]
  /** 店舗名から外す組織名 */
  organizationName: string | null
  primaryColor: string
  listViewData: ListViewData[]
  getEventsForDateStore: (date: number, storeId: string) => EnrichedPublicEvent[]
  scenarios: ScenarioCard[]
  /** 公演を押したとき（作品 ID と公演 ID。作品ページを公演選択済みで開く） */
  onEventClick: (scenarioId: string, eventId: string) => void
  blockedSlots?: PublicEventRow[]
  /** 貸切申込の受付締切（日数）。これより近い日は空き枠を出さない */
  privateBookingDeadlineDays?: number
  organizationSlug?: string
  hideSoldOut?: boolean
  onHideSoldOutChange?: (value: boolean) => void
  hidePlayed?: boolean
  onHidePlayedChange?: (value: boolean) => void
  playedScenarioIds?: Set<string>
  isLoggedIn?: boolean
}

const SLOTS: { key: TimeSlotEn; label: string; range: string }[] = [
  { key: 'morning', label: '朝', range: '9:00〜12:00' },
  { key: 'afternoon', label: '昼', range: '14:00〜18:00' },
  { key: 'evening', label: '夜', range: '19:00〜23:00' },
]
const WEEK = ['日', '月', '火', '水', '木', '金', '土']

/** 公開リストに出さない社内の予定（貸切申込の判定には使うが見せない） */
const HIDDEN_CATEGORIES = new Set(['mtg', 'gmtest', 'testplay', 'venue_rental', 'venue_rental_free', 'package'])

/** 貸切申込の標準の開始・枠の終わり（元のリスト・カレンダーと同じ目安。正式な空き判定は申込の画面で作品ごとに行う） */
const DEFAULT_START: Record<TimeSlotEn, string> = { morning: '09:00', afternoon: '14:00', evening: '19:00' }
const SLOT_END: Record<TimeSlotEn, string> = { morning: '13:00', afternoon: '18:00', evening: '23:00' }
const PRECEDING: Record<TimeSlotEn, TimeSlotEn[]> = { morning: [], afternoon: ['morning'], evening: ['morning', 'afternoon'] }
/** 空き店舗がこの数以上なら 1 つのチップにまとめる */
const GROUP_EMPTY_FROM = 3

/** 前の時間帯の公演の終わり＋1 時間（標準より早くはしない） */
function suggestedStart(slot: TimeSlotEn, preceding: PublicCalendarEvent[]): string {
  const latestEnd = preceding.reduce((latest, e) => ((e.end_time || '') > latest ? (e.end_time || '') : latest), '')
  if (!latestEnd) return DEFAULT_START[slot]
  const [h, m] = latestEnd.split(':').map(Number)
  const t = `${String(h + 1).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
  return t > DEFAULT_START[slot] ? t : DEFAULT_START[slot]
}

interface EmptySlot {
  storeId: string
  storeName: string
  time: string
}

interface SlotItem {
  event: PublicCalendarEvent
  storeName: string
  isPrivate: boolean
}

/**
 * リスト（2026-10-12 社長指示: 朝・昼・夜を列ではなく行に。見本 ListRows.dc.html）。
 * 日付の見出し（固定）→ その日の「朝／昼／夜」の行 → 各行に公演を店舗名付きのカードで縦に（店舗の並び順・時刻順）。
 * 貸切で埋まった枠は行の末尾に灰色の小さなチップ、公演も貸切も無い店舗の枠は紫の「○○店 空き ・ 貸切で申し込む ›」
 * （3 店舗以上はまとめる。今日以降で受付締切より先の日だけ）。公演も貸切も空きも無い時間帯の行は出さない。
 * 年月・店舗・満席を非表示・体験済みを非表示の操作は元のまま。
 */
export const ListView = memo(function ListView({
  listViewMonth,
  onMonthChange,
  selectedStoreIds,
  onStoreIdsChange,
  storeOptions,
  organizationName,
  primaryColor,
  listViewData,
  getEventsForDateStore,
  scenarios,
  onEventClick,
  blockedSlots = [],
  privateBookingDeadlineDays = 14,
  organizationSlug,
  hideSoldOut = false,
  onHideSoldOutChange,
  hidePlayed = false,
  onHidePlayedChange,
  playedScenarioIds = new Set(),
  isLoggedIn = false,
}: ListViewProps) {
  const navigate = useNavigate()
  const todayStr = formatDateJST(new Date())
  const openPrivate = (dateStr: string, slot: TimeSlotEn, empty: EmptySlot) => {
    const base = organizationSlug ? `/${organizationSlug}` : ''
    navigate(`${base}/private-booking-select?date=${dateStr}&store=${empty.storeId}&slot=${slot}&time=${empty.time}`)
  }
  const scenarioMap = useMemo(() => {
    const map = new Map<string, ScenarioCard>()
    scenarios.forEach((s) => {
      map.set(s.scenario_id, s)
      if (s.scenario_title) map.set(s.scenario_title, s)
    })
    return map
  }, [scenarios])

  const blockedByDateStore = useMemo(() => {
    const map = new Map<string, PublicEventRow[]>()
    blockedSlots.forEach((e) => {
      const key = `${e.date}:${e.store_id || e.venue}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    })
    return map
  }, [blockedSlots])

  const days = useMemo(() => {
    const order: number[] = []
    const storesByDate = new Map<number, PublicStoreRow[]>()
    for (const { date, store } of listViewData) {
      if (!storesByDate.has(date)) { storesByDate.set(date, []); order.push(date) }
      storesByDate.get(date)!.push(store)
    }
    const isVisible = (ev: PublicCalendarEvent) => {
      if (HIDDEN_CATEGORIES.has(ev.category ?? '')) return false
      const isPrivate = ev.category === 'private' || ev.is_private_booking === true
      const smId = ev.scenario_master_id || ev.scenario_id
      if (hidePlayed && smId && playedScenarioIds.has(smId)) return false
      if (isPrivate) return !hideSoldOut
      if (hideSoldOut && (ev.player_count_max || 8) - (ev.current_participants || 0) <= 0) return false
      return true
    }
    return order.map((date) => {
      const dateStr = formatDateJST(new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)) // jst-ignore（月の中の日の組み立て）
      const slots: Record<TimeSlotEn, SlotItem[]> = { morning: [], afternoon: [], evening: [] }
      const empties: Record<TimeSlotEn, EmptySlot[]> = { morning: [], afternoon: [], evening: [] }
      // 貸切申込を受け付ける日か（今日以降で、受付締切の日数より先）
      const diffDays = Math.round((new Date(`${dateStr}T00:00:00+09:00`).getTime() - new Date(`${todayStr}T00:00:00+09:00`).getTime()) / 86400000)
      const acceptsPrivate = dateStr >= todayStr && diffDays >= privateBookingDeadlineDays
      for (const store of storesByDate.get(date) ?? []) {
        const storeName = storeDisplayName(store, { organizationName, date: dateStr })
        const events: PublicCalendarEvent[] = [
          ...getEventsForDateStore(date, store.id),
          ...(blockedByDateStore.get(`${dateStr}:${store.id}`) ?? []),
        ]
        // 公演も貸切も社内の予定も入っていない枠を「空き」とする（元のリストの貸切申込ボタンと同じ判定）
        // 臨時会場・オフィスは貸切の空き枠として出さない（店舗数の数え方と同じ）
        if (acceptsPrivate && isPublicRegularStore(store)) {
          for (const slot of SLOTS) {
            if (events.some((e) => startTimeToEn(e.start_time) === slot.key)) continue
            const preceding = events.filter((e) => PRECEDING[slot.key].includes(startTimeToEn(e.start_time)))
            const time = suggestedStart(slot.key, preceding)
            if (time < SLOT_END[slot.key]) empties[slot.key].push({ storeId: store.id, storeName, time })
          }
        }
        events
          .filter(isVisible)
          .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
          .forEach((event) => slots[startTimeToEn(event.start_time)].push({
            event,
            storeName,
            isPrivate: event.category === 'private' || event.is_private_booking === true,
          }))
      }
      const count = SLOTS.reduce((n, s) => n + slots[s.key].filter((i) => !i.isPrivate).length, 0)
      const weekday = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date).getDay() // jst-ignore（曜日）
      return { date, dateStr, weekday, slots, empties, count }
    })
  }, [listViewData, listViewMonth, getEventsForDateStore, blockedByDateStore, organizationName, hideSoldOut, hidePlayed, playedScenarioIds, todayStr, privateBookingDeadlineDays])

  return (
    <div>
      <BookingFilters
        currentMonth={listViewMonth}
        onMonthChange={onMonthChange}
        selectedStoreIds={selectedStoreIds}
        onStoreIdsChange={onStoreIdsChange}
        storeOptions={storeOptions}
        hideSoldOut={hideSoldOut}
        onHideSoldOutChange={onHideSoldOutChange}
        hidePlayed={hidePlayed}
        onHidePlayedChange={onHidePlayedChange}
        isLoggedIn={isLoggedIn}
        primaryColor={primaryColor}
      />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {days.map((day) => {
          const hasAny = SLOTS.some((s) => day.slots[s.key].length > 0 || day.empties[s.key].length > 0)
          return (
            <section key={day.date} aria-label={`${listViewMonth.getMonth() + 1}/${day.date}`}>
              <div className="sticky top-0 z-10 flex items-baseline justify-between border-t border-border bg-white px-3 py-2 first:border-t-0">
                <span className={cn('text-base font-bold', day.weekday === 0 && 'text-red-600', day.weekday === 6 && 'text-blue-600')}>
                  {listViewMonth.getMonth() + 1}/{day.date}({WEEK[day.weekday]})
                </span>
                <span className="text-xs text-muted-foreground">{day.count > 0 ? `公演 ${day.count} 件` : '公演なし'}</span>
              </div>
              {hasAny && (
                <div className="px-3 pb-2">
                  {SLOTS.map((slot) => {
                    const items = day.slots[slot.key]
                    const empties = day.empties[slot.key]
                    if (items.length === 0 && empties.length === 0) return null
                    const performances = items.filter((i) => !i.isPrivate)
                    const privates = items.filter((i) => i.isPrivate)
                    return (
                      <div key={slot.key} className="mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-muted-foreground">{slot.label}</span>
                          <span className="text-xs text-muted-foreground">{slot.range}</span>
                          <span className="flex-1 border-t border-border" />
                        </div>
                        {performances.length > 0 && (
                          <div className="mt-1.5 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                            {performances.map(({ event, storeName }) => {
                              const max = event.player_count_max || 8
                              const available = Math.max(0, max - (event.current_participants || 0))
                              const isFull = available === 0
                              const scenario = scenarioMap.get(event.scenario_id) || scenarioMap.get(event.scenario) || event.scenario_data
                              const scenarioId = scenario ? scenarioCardId(scenario) : null
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  disabled={!scenarioId}
                                  onClick={() => scenarioId && onEventClick(scenarioId, event.id)}
                                  className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-white p-2 text-left hover:bg-muted/40', isFull && 'opacity-70')}
                                >
                                  <KeyVisualThumb src={event.key_visual_url} alt="" seed={event.scenario_master_id || event.id} width={100} className="aspect-[3/4] w-10 shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs text-muted-foreground">{event.start_time?.slice(0, 5)} ・ {storeName}</span>
                                    <span className="block truncate text-sm font-bold">{event.scenario}</span>
                                    <span className={cn(
                                      'mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                                      isFull ? 'bg-muted text-muted-foreground' : available <= 2 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
                                    )}>
                                      {isFull ? '満席・キャンセル待ち' : `残 ${available}`}
                                    </span>
                                  </span>
                                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {(privates.length > 0 || empties.length > 0) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {privates.map(({ event, storeName }) => (
                              <span key={event.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {storeName} {event.start_time?.slice(0, 5)} 貸切
                              </span>
                            ))}
                            {empties.length >= GROUP_EMPTY_FROM ? (
                              <EmptyStoresChip empties={empties} onPick={(e) => openPrivate(day.dateStr, slot.key, e)} />
                            ) : empties.map((e) => (
                              <button key={e.storeId} type="button" className={EMPTY_CHIP} onClick={() => openPrivate(day.dateStr, slot.key, e)}>
                                {e.storeName} 空き ・ 貸切で申し込む ›
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
})

const EMPTY_CHIP = 'rounded-full border border-violet-600 bg-white px-2 py-0.5 text-xs font-bold text-violet-800 hover:bg-violet-50'

/** 空きが 3 店舗以上のときのまとめたチップ。押すと店舗を選ぶ小さな一覧 */
function EmptyStoresChip({ empties, onPick }: { empties: EmptySlot[]; onPick: (e: EmptySlot) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={EMPTY_CHIP}>空き {empties.length} 店舗 ・ 貸切で申し込む ›</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 rounded-lg p-1.5">
        <p className="px-2 py-1 text-xs text-muted-foreground">貸切で申し込む店舗を選んでください</p>
        {empties.map((e) => (
          <button
            key={e.storeId}
            type="button"
            onClick={() => { setOpen(false); onPick(e) }}
            className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          >
            <span>{e.storeName}</span>
            <span className="text-xs text-muted-foreground">{e.time}〜 ›</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
