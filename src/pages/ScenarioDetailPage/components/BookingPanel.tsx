import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VenueAccess } from './VenueAccess'
import type { EventSchedule } from '../utils/types'

interface BookingPanelProps {
  participantCount: number
  maxParticipants: number
  participationFee: number
  selectedEventId: string | null
  isLoggedIn: boolean
  events: EventSchedule[]
  onParticipantCountChange: (count: number) => void
  onBooking: () => void
}

export const BookingPanel = memo(function BookingPanel({
  participantCount,
  maxParticipants,
  participationFee,
  selectedEventId,
  isLoggedIn,
  events,
  onParticipantCountChange,
  onBooking
}: BookingPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 人数を選択 */}
      <div>
        <h3 className="font-bold mb-2 sm:mb-3 text-sm sm:text-base">人数を選択</h3>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm sm:text-base">予約人数</span>
              <select 
                className="border rounded px-2 sm:px-3 py-1.5 text-xs sm:text-sm touch-manipulation"
                value={participantCount}
                onChange={(e) => onParticipantCountChange(Number(e.target.value))}
              >
                {Array.from({ length: maxParticipants }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}名
                  </option>
                ))}
              </select>
            </div>
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
        <h3 className="font-bold mb-2 sm:mb-3 text-sm sm:text-base">料金</h3>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-muted-foreground">参加費（1名）</span>
                <span className="font-medium">
                  ¥{participationFee.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-muted-foreground">人数</span>
                <span className="font-medium">× {participantCount}名</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-bold text-sm sm:text-base">合計</span>
                <span className="text-xl sm:text-2xl font-bold text-blue-600">
                  ¥{(participationFee * participantCount).toLocaleString()}
                </span>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-2 sm:p-3 text-xs sm:text-sm text-blue-800">
                <p className="font-medium mb-0.5 sm:mb-1">現地決済</p>
                <p className="text-xs">当日会場にてお支払いください</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 予約確認ボタン */}
      <Button 
        className="w-full bg-blue-600 text-white hover:bg-blue-700 h-11 sm:h-12 font-bold text-sm sm:text-base touch-manipulation"
        onClick={onBooking}
        disabled={!selectedEventId || !isLoggedIn}
      >
        {!isLoggedIn ? 'ログインして予約する' : !selectedEventId ? '日付を選択してください' : '予約確認へ進む'}
      </Button>
    </div>
  )
})

