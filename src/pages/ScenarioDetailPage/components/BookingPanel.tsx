import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VenueAccess } from './VenueAccess'
import { Calendar, ArrowDown } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
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
    <div className="space-y-3">
      {/* 日付未選択時のガイダンス */}
      {!selectedEventId && (
        <div 
          className="p-3 border-2 border-dashed flex items-center gap-3"
          style={{ borderColor: THEME.primary, backgroundColor: `${THEME.primary}08` }}
        >
          <div 
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center animate-bounce"
            style={{ backgroundColor: THEME.accentLight, color: THEME.primary }}
          >
            <ArrowDown className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium text-sm" style={{ color: THEME.primary }}>
              まず日程を選択してください
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              下の「公演日程」から参加したい日を選んでください
            </p>
          </div>
        </div>
      )}

      {/* 選択中の日程表示 */}
      {selectedEventId && (() => {
        const selectedEvent = events.find(e => e.event_id === selectedEventId)
        if (!selectedEvent) return null
        return (
          <div 
            className="p-3 border-2 flex items-center gap-3"
            style={{ borderColor: THEME.primary, backgroundColor: `${THEME.primary}08` }}
          >
            <div 
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center"
              style={{ backgroundColor: THEME.accentLight, color: THEME.primary }}
            >
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm" style={{ color: THEME.primary }}>
                選択中の日程
              </p>
              <p className="text-sm text-gray-700 mt-0.5">
                {new Date(selectedEvent.date).toLocaleDateString('ja-JP', { 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'short'
                })} {selectedEvent.start_time?.slice(0, 5)}〜
              </p>
              <p className="text-xs text-gray-500">
                {selectedEvent.store_name}
              </p>
            </div>
          </div>
        )
      })()}

      {/* 人数を選択 */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">人数を選択</h3>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">予約人数</span>
              <select 
                className="border px-3 py-1.5 text-sm"
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
        <h3 className="text-sm font-medium text-muted-foreground mb-2">料金</h3>
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">参加費（1名）</span>
              <span className="font-medium">¥{participationFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">人数</span>
              <span className="font-medium">{participantCount}名</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">合計</span>
                <span className="text-base font-bold text-primary">
                  ¥{(participationFee * participantCount).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 予約確認ボタン */}
      <Button 
        className="w-full h-10 text-base"
        onClick={() => {
          if (!isLoggedIn) {
            // 未ログイン時はログインページへ遷移
            window.location.href = '/login'
            return
          }
          onBooking()
        }}
        disabled={!selectedEventId}
        style={selectedEventId ? { backgroundColor: THEME.primary } : {}}
      >
        {!isLoggedIn ? 'ログインして予約する' : !selectedEventId ? '↓ 日程を選択してください' : '予約確認へ進む'}
      </Button>

      {/* 未ログイン時の追加案内 */}
      {!isLoggedIn && selectedEventId && (
        <p className="text-xs text-center text-gray-500">
          予約にはログインが必要です。<a href="/signup" className="text-primary underline">新規登録はこちら</a>
        </p>
      )}
    </div>
  )
})

