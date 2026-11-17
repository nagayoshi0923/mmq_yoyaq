import { useNavigate } from 'react-router-dom'
import type { EventSchedule } from '../utils/types'
import { formatJstMonthDay } from '@/utils/jstDate'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'

const BAR = 'fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur'
const INNER = 'mx-auto max-w-4xl px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]'

interface ScheduleBarProps {
  scenarioTitle: string
  selectedEvent: EventSchedule | null
  participantCount: number
  fee: number
  /** 料金が未確定（独自休日を読み込み中など）のときに金額の代わりに出す文 */
  feeUnknownText?: string | null
  isLoggedIn: boolean
  onBooking: () => void
  accent: string
}

/** 「公演に参加する」の下に固定する帯: 選んだ回・人数・合計 と「予約内容の確認へ」 */
export function ScheduleBookingBar({ scenarioTitle, selectedEvent, participantCount, fee, feeUnknownText = null, isLoggedIn, onBooking, accent }: ScheduleBarProps) {
  const navigate = useNavigate()
  const full = !!selectedEvent && selectedEvent.available_seats <= 0

  // ログイン・新規登録から戻ったときに同じ回と人数を選んだ状態にする（点検 1・12）
  const returnTo = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('step')
    if (selectedEvent) {
      params.set('event', selectedEvent.event_id)
      params.set('count', String(participantCount))
    }
    const q = params.toString()
    return `${window.location.pathname}${q ? `?${q}` : ''}`
  }
  const intent = selectedEvent
    ? `「${scenarioTitle}」${formatJstMonthDay(selectedEvent.date, true)} ${selectedEvent.start_time.slice(0, 5)}〜・${participantCount}名`
    : `「${scenarioTitle}」`

  const handleClick = () => {
    if (!isLoggedIn) {
      navigate(loginUrlWithIntent('login', returnTo(), intent))
      return
    }
    onBooking()
  }

  const label = !selectedEvent ? '参加したい回を選んでください' : full ? 'キャンセル待ちに登録' : isLoggedIn ? '予約内容の確認へ' : 'ログインして予約へ進む'

  return (
    <div className={BAR} data-testid="booking-cta-bar">
      <div className={INNER}>
        {selectedEvent && (
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {formatJstMonthDay(selectedEvent.date, true)} {selectedEvent.start_time.slice(0, 5)}・{selectedEvent.store_short_name || selectedEvent.store_name}・{participantCount}人
            </p>
            <p className="shrink-0 text-lg font-bold">{feeUnknownText ?? `${(fee * participantCount).toLocaleString()}円`}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleClick}
          disabled={!selectedEvent}
          className="h-12 w-full text-base font-bold text-white disabled:bg-gray-300"
          style={selectedEvent ? { backgroundColor: full ? '#b45309' : accent } : undefined}
        >
          {label}
        </button>
        {!isLoggedIn && selectedEvent && (
          <p className="mt-1 text-center text-2xs text-muted-foreground">
            予約にはログインが必要です。
            <button type="button" className="underline" onClick={() => navigate(loginUrlWithIntent('signup', returnTo(), intent))}>はじめての方は新規登録</button>
          </p>
        )}
      </div>
    </div>
  )
}

interface PrivateBarProps {
  count: number
  selectedStores: number
  totalStores: number
  isLoggedIn: boolean
  /** 空き状況を確かめられたか（読めない間は申し込みへ進めない） */
  ready: boolean
  onRequest: () => void
}

/** 「貸切で遊ぶ」の下に固定する帯: 候補の数・選んだ店舗の数 と「確認へ」 */
export function PrivateRequestBar({ count, selectedStores, totalStores, isLoggedIn, ready, onRequest }: PrivateBarProps) {
  const disabled = isLoggedIn && (count === 0 || !ready)
  return (
    <div className={BAR} data-testid="private-cta-bar">
      <div className={`${INNER} flex items-center gap-3`}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">候補 {count}件</p>
          <p className="text-2xs text-muted-foreground">店舗 {selectedStores}/{totalStores} を選択中</p>
          {!ready && count > 0 && <p role="status" className="text-2xs text-amber-700">空き状況を確認できるまでお待ちください</p>}
        </div>
        <button
          type="button"
          onClick={onRequest}
          disabled={disabled}
          className="h-12 shrink-0 px-8 text-base font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: PRIVATE_PURPLE }}
        >
          {isLoggedIn ? '確認へ' : 'ログインして確認へ'}
        </button>
      </div>
    </div>
  )
}
