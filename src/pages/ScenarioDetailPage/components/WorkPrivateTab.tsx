// 作品ページ「貸切で遊ぶ」: 店舗チップ → 空いている日（近い順）から候補を選ぶ。
// 空き判定は DB（private_booking_candidate_slot_availability）の結果をそのまま使う。画面では判定しない。
// 仕様の正本: docs/product-spec/貸切受付ルール.md
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimeSlot } from '../utils/types'
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import type { PrivateBookingHorizonState } from '@/lib/privateBookingHorizon'
import { PrivateBookingHorizonNotice } from '@/components/private-booking/PrivateBookingHorizonNotice'
import { isWeekendOrHoliday } from '../utils/pricingUtils'
import { formatJstMonthDay } from '@/utils/jstDate'
import { cn } from '@/lib/utils'
import './WorkPrivateTab.css'

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

  // 開いた月に空きが1つも無い（締切が14日前の店舗を月末に開いた、など）ときは、空きのある月まで自動で送る。
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
  const now = new Date()
  const isThisMonth = currentMonth.getFullYear() === now.getFullYear() && currentMonth.getMonth() === now.getMonth()

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

  const dayLabel = (date: string) => formatJstMonthDay(date, true).replace('(', '（').replace(')', '）')
  const [summaryHead, ...summaryRest] = summary.split('（')

  return (
    <div data-testid="work-private-tab" className="wpt">
      <div className="wpt__summary-wrap">
        <div className="wpt__summary">
          <p className="wpt__summary-main"><b>{summaryHead}</b>{summaryRest.length > 0 && `（${summaryRest.join('（')}`}</p>
          <p className="wpt__summary-sub">申し込むと、店舗が日時を決めてお知らせします</p>
        </div>
      </div>

      {stores.length > 0 && (
        <div className="wpt__stores">
          <p className="wpt__title">店舗（この作品を貸切できる店舗）</p>
          <div className="wpt__chips">
            {stores.map((s) => {
              const on = selectedStoreIds.includes(s.id)
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => toggleStore(s.id)} className={cn('wpt__chip', on && 'is-on')}>
                  {on && '✓ '}{s.short_name || s.name}
                </button>
              )
            })}
          </div>
          {/* 開催店舗は選んだ店舗の中から店舗側が決める（2026-11-18 えいきち指示で明記） */}
          <p className="wpt__hint">選択した店舗のいずれかになります。</p>
        </div>
      )}

      <div className="wpt__dates-head">
        <p className="wpt__title">空いている日（近い順）</p>
        <p className="wpt__hint">押すと候補に入ります・最大{maxSelections}つ</p>
      </div>
      <div className="wpt__chips wpt__filters" data-testid="private-filter">
        <button type="button" aria-pressed={weekendOnly} onClick={() => setWeekendOnly((v) => !v)} className={cn('wpt__chip', weekendOnly && 'is-on')}>土日祝だけ</button>
        <button type="button" aria-pressed={time === 'all'} onClick={() => setTime('all')} className={cn('wpt__chip', time === 'all' && 'is-on')}>すべての時間</button>
        <button type="button" aria-pressed={time === 'day'} onClick={() => setTime('day')} className={cn('wpt__chip', time === 'day' && 'is-on')}>昼</button>
        <button type="button" aria-pressed={time === 'night'} onClick={() => setTime('night')} className={cn('wpt__chip', time === 'night' && 'is-on')}>夜</button>
      </div>
      <label className="wpt__full">
        <input type="checkbox" checked={showFull} onChange={(e) => setShowFull(e.target.checked)} />
        満席の枠も表示する
      </label>

      <div className="wpt__month" data-testid="private-month-nav">
        <button type="button" onClick={() => changeMonthByHand(-1)} disabled={isThisMonth}>‹ 前の月</button>
        <p>{currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月</p>
        <button type="button" onClick={() => changeMonthByHand(1)} disabled={isNextMonthDisabled}>次の月 ›</button>
      </div>

      <div className="wpt__list">
        {notice && <p role="status" className="mb-2 bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p>}
        {horizon && horizon.days === null ? (
          <PrivateBookingHorizonNotice horizon={horizon} />
        ) : availabilityError ? (
          <div className="border-2 border-red-300 bg-red-50 p-3" data-testid="private-booking-availability-error">
            <p role="alert" className="text-sm font-bold text-red-800">空き状況を読み込めませんでした。通信を確認して再読み込みしてください</p>
            {onRetry && (
              <button type="button" onClick={onRetry} disabled={loading} className="mt-2 w-full border border-gray-300 bg-white py-2.5 text-sm font-bold" data-testid="private-booking-availability-retry">
                {loading ? '読み込み中…' : '空き状況を再読み込み'}
              </button>
            )}
          </div>
        ) : loading && rows.length === 0 ? (
          <p className="wpt__message">空き状況を読み込み中…</p>
        ) : rows.length === 0 ? (
          <div className="wpt__message" data-testid="private-month-empty">
            <p>{filtered ? 'この月は条件に合う空きがありません' : 'この月は空いている日がありません'}</p>
            {!isNextMonthDisabled && (
              <button type="button" onClick={() => changeMonthByHand(1)} className="wpt__next">次の月を見る ›</button>
            )}
          </div>
        ) : (
          <>
            {rows.map(({ date, slots }) => (
              <section key={date}>
                <h3 className="wpt__day">{dayLabel(date)}</h3>
                {slots.map(({ slot, reason }) => {
                  const n = order.get(`${date}-${slot.label}`)
                  const selected = n != null
                  // 他の公演と重なる枠は「満席」と出し、押せない（理由も開かない。貸切受付ルール 2026-10-22）
                  const conflict = reason === CONFLICT_REASON && !selected
                  return (
                    <button
                      key={slot.label}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${date} ${slot.label}${reason ? ` 選択不可（${reason}）` : ''}`}
                      disabled={conflict}
                      onClick={() => handleRow(date, slot, reason)}
                      className={cn('wpt__row', selected && 'is-on', reason && !selected && 'is-off')}
                    >
                      <span className="wpt__box" aria-hidden="true">{selected && '✓'}</span>
                      <span className="wpt__time">{slot.startTime || '—'}</span>
                      <span className="wpt__store">{storeLabel(date, slot, reason)}</span>
                      <span className="wpt__state">{selected ? `第${n}希望` : reason ? (reason === CONFLICT_REASON ? '満席' : '選べません') : '空きあり'}</span>
                    </button>
                  )
                })}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
