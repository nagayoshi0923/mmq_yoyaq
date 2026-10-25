import { memo, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VenueAccess } from './VenueAccess'
import type { EventSchedule } from '../utils/types'
import type { ThemePreset } from '@/lib/themePresets'
import { PRICE_NOTE } from '@/lib/priceNote'
import { isFewSeats, seatCountText } from '@/lib/seatLabel'

interface BookingPanelViewProps {
  participantCount: number
  participationFee: number
  selectedEventId: string | null
  isLoggedIn: boolean
  events: EventSchedule[]
  onParticipantCountChange: (count: number) => void
  onBookingClick: () => void
  onSignupClick: () => void
  selectableMax: number
  availableSeats: number
  selectedEvent: EventSchedule | null | undefined
  maxParticipants: number
  isWeekendOrHolidayDate: boolean
  preset: ThemePreset
  notice: ReactNode
}

/** 予約パネルの表示のみ。試作は認証・予約処理へ接続しない。 */
export const BookingPanelView = memo(function BookingPanelView({ participantCount, participationFee,
  selectedEventId, isLoggedIn, events, onParticipantCountChange, onBookingClick, onSignupClick,
  selectableMax, availableSeats, selectedEvent, maxParticipants, isWeekendOrHolidayDate, preset, notice,
}: BookingPanelViewProps) {
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
                {seatCountText(selectedEvent?.current_participants, selectedEvent?.max_participants || maxParticipants)}
                {isFewSeats(availableSeats) && <span className="ml-1.5 font-bold text-orange-600">残少</span>}
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

      {notice}

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
          onClick={onBookingClick}
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
            onClick={onSignupClick}
            className="text-primary underline"
          >
            新規登録はこちら
          </button>
        </p>
      )}
    </div>
  )
})
