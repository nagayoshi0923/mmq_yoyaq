// 作品ページ「貸切で遊ぶ」: 店舗チップ → 空いている日（近い順）から候補を選ぶ。
// 空き判定は DB（private_booking_candidate_slot_availability）の結果をそのまま使う。画面では判定しない。
// 仕様の正本: docs/product-spec/貸切受付ルール.md
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimeSlot } from '../utils/types'
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import type { PrivateBookingHorizonState } from '@/lib/privateBookingHorizon'
import { PrivateBookingHorizonNotice } from '@/components/private-booking/PrivateBookingHorizonNotice'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'
import { isWeekendOrHoliday } from '../utils/pricingUtils'
import { formatJstMonthDay } from '@/utils/jstDate'
import { cn } from '@/lib/utils'

interface StoreOption {
  id: string
  name: string
  short_name?: string
}

type TimeFilter = 'all' | 'day' | 'night'

const CONFLICT_REASON = '他の公演と重なります'

interface WorkPrivateTabProps {
  /** 上の案内（「6人で貸切…」） */
  summary: string
  stores: StoreOption[]
  selectedStoreIds: string[]
  onStoreIdsChange: (ids: string[]) => void
  currentMonth: Date
  onMonthChange: (delta: number) => void
  isNextMonthDisabled?: boolean
  availableDates: string[]
  slotAvailability: CandidateSlotAvailability
  /** `${date}-${label}` → その枠が空いている店舗 id。行に「馬場・大久保」と出す（無ければ選んだ店舗が1つのときその店舗） */
  slotStoreIds?: Record<string, string[]>
  selectedSlots: Array<{ date: string; slot: TimeSlot }>
  onToggle: (date: string, slot: TimeSlot) => void
  maxSelections: number
  loading?: boolean
  availabilityError?: string | null
  onRetry?: () => void
  horizon?: PrivateBookingHorizonState
  /** 公演日の何日前まで申し込めるか */
  deadlineDays?: number
  isCustomHoliday?: (date: string) => boolean
}

function isTooSoon(date: string, deadlineDays: number): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadline = new Date(today)
  deadline.setDate(today.getDate() + deadlineDays)
  return new Date(`${date}T00:00:00+09:00`) < deadline
}

export function WorkPrivateTab({
  summary,
  stores,
  selectedStoreIds,
  onStoreIdsChange,
  currentMonth,
  onMonthChange,
  isNextMonthDisabled = false,
  availableDates,
  slotAvailability,
  slotStoreIds = {},
  selectedSlots,
  onToggle,
  maxSelections,
  loading = false,
  availabilityError = null,
  onRetry,
  horizon,
  deadlineDays = 14,
  isCustomHoliday,
}: WorkPrivateTabProps) {
  const [weekendOnly, setWeekendOnly] = useState(false)
  const [time, setTime] = useState<TimeFilter>('all')
  const [showFull, setShowFull] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // 受け付ける店舗が1つだけなら最初から選んでおく
  useEffect(() => {
    if (stores.length === 1 && selectedStoreIds.length === 0) onStoreIdsChange([stores[0].id])
  }, [stores, selectedStoreIds.length, onStoreIdsChange])

  const toggleStore = (id: string) => {
    const next = selectedStoreIds.includes(id) ? selectedStoreIds.filter((x) => x !== id) : [...selectedStoreIds, id]
    if (next.length === 0) return // 全部は外さない
    onStoreIdsChange(next)
  }

  const order = useMemo(() => new Map(selectedSlots.map((s, i) => [`${s.date}-${s.slot.label}`, i + 1])), [selectedSlots])

  const rows = useMemo(() => {
    const out: Array<{ date: string; slots: Array<{ slot: PrivateBookingSlot; reason: string | null }> }> = []
    for (const date of [...availableDates].sort()) {
      if (isTooSoon(date, deadlineDays)) continue // 締切を過ぎた日は出さない
      if (weekendOnly && !isWeekendOrHoliday(date, isCustomHoliday)) continue
      const slots = (slotAvailability.slotsByDate[date] ?? []).filter((slot) => {
        if (time === 'day' && slot.label === '夜') return false
        if (time === 'night' && slot.label !== '夜') return false
        return true
      }).map((slot) => {
        const key = `${date}-${slot.label}`
        const reason = slotAvailability.unavailableReasons[key] ?? (slot.startTime ? null : '選択できません')
        return { slot, reason }
      }).filter(({ slot, reason }) => showFull || !reason || order.has(`${date}-${slot.label}`))
      if (slots.length > 0) out.push({ date, slots })
    }
    return out
  }, [availableDates, deadlineDays, weekendOnly, isCustomHoliday, slotAvailability, time, showFull, order])

  // 開いた月に空きが1つも無い（締切が14日前の店舗で月末に開いた、など）ときは、空きのある月まで自動で送る。
  // 絞り込みをしていないときだけ・最初に開いたときだけ（自分で月を動かしたら送らない）。最大3か月。
  // 「空いている日が1個も出ない」と見えないようにする（2026-11-18 えいきち報告、札幌店）
  const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`
  const autoSkipRef = useRef({ count: 0, manual: false, lastKey: '' })
  const loadedForMonth = availableDates.some((d) => (slotAvailability.slotsByDate[d]?.length ?? 0) > 0)
  const filtered = weekendOnly || time !== 'all' || showFull
  useEffect(() => {
    const st = autoSkipRef.current
    if (st.manual || st.count >= 3 || filtered || loading || availabilityError || isNextMonthDisabled) return
    if (!loadedForMonth || rows.length > 0 || st.lastKey === monthKey) return
    st.count += 1
    st.lastKey = monthKey
    onMonthChange(1)
  }, [loading, loadedForMonth, rows.length, monthKey, filtered, availabilityError, isNextMonthDisabled, onMonthChange])
  const changeMonthByHand = (delta: number) => {
    autoSkipRef.current.manual = true
    onMonthChange(delta)
  }

  const handleRow = useCallback((date: string, slot: PrivateBookingSlot, reason: string | null) => {
    const key = `${date}-${slot.label}`
    if (reason && !order.has(key)) {
      setNotice(`${formatJstMonthDay(date, true)} ${slot.label}: ${reason}`)
      return
    }
    if (!order.has(key) && order.size >= maxSelections) {
      setNotice(`候補は${maxSelections}つまで選べます`)
      return
    }
    setNotice(null)
    onToggle(date, { label: slot.label, startTime: slot.startTime, endTime: slot.endTime })
  }, [order, maxSelections, onToggle])

  // 行に出す店舗名（見本: 「13:00 馬場 空きあり」「19:00 馬場・大久保 第1希望」）
  const storeLabel = (date: string, slot: PrivateBookingSlot, reason: string | null): string => {
    const nameOf = (id: string) => { const s = stores.find((x) => x.id === id); return s ? (s.short_name || s.name) : '' }
    if (!reason || order.has(`${date}-${slot.label}`)) {
      const ids = slotStoreIds[`${date}-${slot.label}`]
        ?? (selectedStoreIds.length === 1 ? selectedStoreIds : [])
      const names = selectedStoreIds.filter((id) => ids.includes(id)).map(nameOf).filter(Boolean)
      if (names.length > 0) return names.join('・')
    }
    return slot.label
  }

  const now = new Date()
  const isThisMonth = currentMonth.getFullYear() === now.getFullYear() && currentMonth.getMonth() === now.getMonth()

  return (
    <div data-testid="work-private-tab">
      <div className="bg-violet-50 px-4 py-3">
        <p className="text-sm font-bold">{summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">申し込むと、店舗が日時を決めてお知らせします</p>
      </div>

      {stores.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-bold">店舗（この作品を貸切できる店舗）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stores.map((s) => {
              const on = selectedStoreIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStore(s.id)}
                  className={cn('h-9 rounded-full border px-4 text-sm font-bold', on ? 'text-white' : 'border-gray-300 bg-white text-gray-500')}
                  style={on ? { backgroundColor: PRIVATE_PURPLE, borderColor: PRIVATE_PURPLE } : undefined}
                >
                  {on && '✓ '}{s.short_name || s.name}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">押すと外せます。外した店舗の空きは下に出ません</p>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold">空いている日（近い順）</p>
          <p className="text-2xs text-muted-foreground">押すと候補に入ります・最大{maxSelections}つ</p>
        </div>
        {/* 日にちと時間は別の並び（「土日祝だけ」と「すべての時間」が同じ並びで両方選ばれて見えないように。2026-11-18 えいきち報告） */}
        <div className="mt-2 flex items-center gap-2" data-testid="private-day-filter">
          <span className="w-12 shrink-0 text-xs text-muted-foreground">日にち</span>
          <RenewalChip selected={!weekendOnly} onClick={() => setWeekendOnly(false)}>すべての日</RenewalChip>
          <RenewalChip selected={weekendOnly} onClick={() => setWeekendOnly(true)}>土日祝だけ</RenewalChip>
        </div>
        <div className="mt-2 flex items-center gap-2" data-testid="private-time-filter">
          <span className="w-12 shrink-0 text-xs text-muted-foreground">時間</span>
          <RenewalChip selected={time === 'all'} onClick={() => setTime('all')}>すべて</RenewalChip>
          <RenewalChip selected={time === 'day'} onClick={() => setTime('day')}>昼</RenewalChip>
          <RenewalChip selected={time === 'night'} onClick={() => setTime('night')}>夜</RenewalChip>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={showFull} onChange={(e) => setShowFull(e.target.checked)} className="h-4 w-4" />
          満席の枠も表示する
        </label>
        {deadlineDays > 0 && (
          <p className="mt-1 text-2xs text-muted-foreground">貸切は公演日の{deadlineDays}日前まで申し込めます</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => changeMonthByHand(-1)} disabled={isThisMonth} className="px-1 py-2 text-sm disabled:opacity-30">‹ 前の月</button>
        <p className="text-sm font-bold">{currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月</p>
        <button type="button" onClick={() => changeMonthByHand(1)} disabled={isNextMonthDisabled} className="px-1 py-2 text-sm disabled:opacity-30">次の月 ›</button>
      </div>

      {notice && <p role="status" className="mb-2 bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p>}

      {horizon && horizon.days === null ? (
        <PrivateBookingHorizonNotice horizon={horizon} className="mt-2" />
      ) : availabilityError ? (
        <div className="border-2 border-red-300 bg-red-50 p-3" data-testid="private-booking-availability-error">
          <p role="alert" className="text-sm font-bold text-red-800">空き状況を読み込めませんでした。通信を確認して再読み込みしてください</p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={loading} className="mt-2 w-full border border-gray-300 bg-white py-2.5 text-sm font-bold" data-testid="private-booking-availability-retry">
              {loading ? '読み込み中…' : '空き状況を再読み込み'}
            </button>
          )}
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">空き状況を読み込み中…</p>
      ) : rows.length === 0 ? (
        <div className="border border-gray-200 bg-gray-50 p-4 text-center text-sm text-muted-foreground" data-testid="private-month-empty">
          <p>{filtered ? 'この月は条件に合う空きがありません。次の月を見るか、絞り込みを外してください' : 'この月は空いている日がありません'}</p>
          {!isNextMonthDisabled && (
            <button type="button" onClick={() => changeMonthByHand(1)} className="mt-3 w-full border border-gray-300 bg-white py-2.5 text-sm font-bold text-foreground">
              次の月を見る ›
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(({ date, slots }) => (
            <section key={date}>
              <h3 className="border-b-2 border-gray-900 pb-1.5 text-sm font-bold">{formatJstMonthDay(date, true)}</h3>
              <ul>
                {slots.map(({ slot, reason }) => {
                  const n = order.get(`${date}-${slot.label}`)
                  const selected = n != null
                  // 他の公演と重なる枠は「満席」と出し、押せない（理由も開かない。貸切受付ルール 2026-10-22）
                  const conflict = reason === CONFLICT_REASON && !selected
                  return (
                    <li key={slot.label}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${date} ${slot.label}${reason ? ` 選択不可（${reason}）` : ''}`}
                        disabled={conflict}
                        onClick={() => handleRow(date, slot, reason)}
                        className={cn('flex min-h-12 w-full items-center gap-3 border-b border-gray-200 px-2 text-left', selected && 'bg-violet-50', reason && !selected && 'text-gray-400')}
                      >
                        <span
                          className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center border-2 text-xs text-white', selected ? '' : 'border-gray-400')}
                          style={selected ? { backgroundColor: PRIVATE_PURPLE, borderColor: PRIVATE_PURPLE } : undefined}
                          aria-hidden="true"
                        >{selected && '✓'}</span>
                        <span className="w-14 text-base font-bold">{slot.startTime || '—'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{storeLabel(date, slot, reason)}{slot.adjusted ? '（前後の公演に合わせた時刻）' : ''}</span>
                        <span className={cn('text-xs', selected ? 'font-bold' : 'text-muted-foreground')} style={selected ? { color: PRIVATE_PURPLE } : undefined}>
                          {selected ? `第${n}希望` : reason ? (reason === CONFLICT_REASON ? '満席' : '選べません') : '空きあり'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

    </div>
  )
}
