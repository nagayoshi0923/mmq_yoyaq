import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VenueAccess } from './VenueAccess'
import { BookingNotice } from './BookingNotice'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import type { EventSchedule } from '../utils/types'
import { isWeekendOrHoliday } from '../utils/pricingUtils'
import { formatJstMonthDay } from '@/utils/jstDate'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { PRICE_NOTE } from '@/lib/priceNote'

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
    <div className="space-y-4">
      {/* 人数を選択 */}
      <div>
        <h3 className="ts-label">人数を選択</h3>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="ts-muted">予約人数</span>
              <select
                className="border px-3 py-1.5 ts-body"
                value={participantCount}
                onChange={(e) => onParticipantCountChange(Number(e.target.value))}
              >
                {selectableMax > 0 ? (
                  Array.from({ length: selectableMax }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}名
                    </option>
                  ))
                ) : (
                  <option value={0}>満席</option>
                )}
              </select>
            </div>
            {/* 残席表示 */}
            {selectedEventId && availableSeats > 0 && (
              <p className="ts-caption mt-1.5">
                残り{availableSeats}席
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 会場アクセス（選択した公演がある場合のみ表示） */}
      {selectedEventId && (
        <VenueAccess
          events={events}
          selectedEventId={selectedEventId}
          mode="schedule"
        />
      )}

      {/* 料金情報 */}
      <div>
        <h3 className="ts-label">料金</h3>
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="ts-muted">
                参加費（1名{isWeekendOrHolidayDate ? '・土日祝' : ''}）
              </span>
              <span className="ts-body font-medium">¥{participationFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="ts-muted">人数</span>
              <span className="ts-body font-medium">{participantCount}名</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="ts-muted">合計</span>
                <span className="ts-emph" style={{ color: preset.primary }}>
                  ¥{(participationFee * participantCount).toLocaleString()}
                </span>
              </div>
              <p className="ts-caption mt-1" data-testid="scenario-price-note">{PRICE_NOTE}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 注意事項（ボタンの上に表示） */}
      <BookingNotice 
        reservationDeadlineHours={reservationDeadlineHours}
        hasPreReading={hasPreReading}
        mode="schedule"
        storeId={selectedEvent?.store_id || null}
        eventId={selectedEventId}
      />

      {/* 予約確認ボタン（スマホでは公演を選ぶと画面下に固定。注意事項の下に埋もれない／点検 18） */}
      <div
        className={selectedEventId
          ? 'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none'
          : undefined}
        data-testid="booking-cta-bar"
      >
        {selectedEventId && (
          <p className="mb-1 flex items-center justify-between ts-caption md:hidden">
            <span>{participantCount}名</span>
            <span className="font-medium text-foreground">合計 ¥{(participationFee * participantCount).toLocaleString()}（税込）</span>
          </p>
        )}
        <Button 
          className="w-full h-11 text-base"
          onClick={handleClick}
          disabled={!selectedEventId}
          style={selectedEventId ? { backgroundColor: selectableMax <= 0 ? '#d97706' : preset.primary } : {}}
        >
          {!isLoggedIn 
            ? 'ログインして予約する' 
            : !selectedEventId 
              ? '↓ 日程を選択してください' 
              : selectableMax <= 0 
                ? 'キャンセル待ちに登録' 
                : '予約確認へ進む'}
        </Button>
      </div>
      {/* 未ログイン時の追加案内 */}
      {!isLoggedIn && selectedEventId && (
        <p className="ts-caption text-center">
          予約にはログインが必要です。
          <button
            type="button"
            onClick={() => navigate(loginUrlWithIntent('signup', authReturnTo(), authIntentLabel))}
            className="text-primary underline"
          >
            新規登録はこちら
          </button>
        </p>
      )}
    </div>
  )
})

