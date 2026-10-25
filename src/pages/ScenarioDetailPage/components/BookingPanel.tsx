import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookingNotice } from './BookingNotice'
import { BookingPanelView } from './BookingPanelView'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import type { EventSchedule } from '../utils/types'
import { isWeekendOrHoliday } from '../utils/pricingUtils'
import { formatJstMonthDay } from '@/utils/jstDate'
import { loginUrlWithIntent } from '@/lib/authReturn'

interface BookingPanelProps {
  /** ログイン画面に「何を予約しようとしているか」を出すため（点検 25） */
  scenarioTitle: string
  participantCount: number
  maxParticipants: number
  participationFee: number
  selectedEventId: string | null
  isLoggedIn: boolean
  events: EventSchedule[]
  onParticipantCountChange: (count: number) => void
  onBooking: () => void
  reservationDeadlineHours?: number
  hasPreReading?: boolean
}

export const BookingPanel = memo(function BookingPanel({
  scenarioTitle,
  participantCount,
  maxParticipants,
  participationFee,
  selectedEventId,
  isLoggedIn,
  events,
  onParticipantCountChange,
  onBooking,
  reservationDeadlineHours,
  hasPreReading
}: BookingPanelProps) {
  const navigate = useNavigate()
  const preset = useOrgThemePreset()

  // 選択した公演の残席数を取得
  const selectedEvent = selectedEventId ? events.find(e => e.event_id === selectedEventId) : null
  const availableSeats = selectedEvent 
    ? (selectedEvent.max_participants || maxParticipants) - (selectedEvent.current_participants || 0)
    : maxParticipants
  // 選択可能な最大人数（残席数とシナリオ最大人数の小さい方）
  const selectableMax = Math.min(availableSeats, maxParticipants)

  // ログイン・新規登録へ行くときの戻り先（選んだ公演と人数は URL に入っている。点検 1・12）と、何を予約しようとしているか
  // URL への書き戻しは描画の後なので、押した時点の選択から組み立てる
  const authReturnTo = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('step')
    if (selectedEventId) {
      params.set('event', selectedEventId)
      params.set('count', String(participantCount))
    }
    const query = params.toString()
    return `${window.location.pathname}${query ? `?${query}` : ''}`
  }
  const authIntentLabel = selectedEvent
    ? `「${scenarioTitle}」${formatJstMonthDay(selectedEvent.date, true)} ${selectedEvent.start_time.slice(0, 5)}〜・${participantCount}名`
    : `「${scenarioTitle}」`

  // 選択した日付が土日祝かどうか
  const isWeekendOrHolidayDate = useMemo(() => {
    if (!selectedEvent?.date) return false
    return isWeekendOrHoliday(selectedEvent.date)
  }, [selectedEvent?.date])

  const handleClick = () => {
    if (!isLoggedIn) {
      // 未ログイン時は戻り先（選んだ公演と人数入りの URL）を付けてログインへ（#1062）
      navigate(loginUrlWithIntent('login', authReturnTo(), authIntentLabel))
      return
    }
    onBooking()
  }

  return (
    <BookingPanelView
      participantCount={participantCount} participationFee={participationFee}
      selectedEventId={selectedEventId} isLoggedIn={isLoggedIn} events={events}
      onParticipantCountChange={onParticipantCountChange} onBookingClick={handleClick}
      onSignupClick={() => navigate(loginUrlWithIntent('signup', authReturnTo(), authIntentLabel))}
      selectableMax={selectableMax} availableSeats={availableSeats} selectedEvent={selectedEvent}
      maxParticipants={maxParticipants} isWeekendOrHolidayDate={isWeekendOrHolidayDate} preset={preset}
      notice={<BookingNotice reservationDeadlineHours={reservationDeadlineHours} hasPreReading={hasPreReading}
        mode="schedule" storeId={selectedEvent?.store_id || null} eventId={selectedEventId} />}
    />
  )
})
