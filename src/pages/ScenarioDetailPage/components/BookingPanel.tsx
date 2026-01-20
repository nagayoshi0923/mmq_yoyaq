import { memo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VenueAccess } from './VenueAccess'
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
  const navigate = useNavigate()
  
  // 選択した公演の残席数を取得
  const selectedEvent = selectedEventId ? events.find(e => e.event_id === selectedEventId) : null
  const availableSeats = selectedEvent 
    ? (selectedEvent.max_participants || maxParticipants) - (selectedEvent.current_participants || 0)
    : maxParticipants
  // 選択可能な最大人数（残席数とシナリオ最大人数の小さい方）
  const selectableMax = Math.min(availableSeats, maxParticipants)

  return (
    <div className="space-y-3">
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
              <p className="text-xs text-muted-foreground mt-1.5">
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
            // 未ログイン時は戻り先URLを保存してログインページへ遷移
            sessionStorage.setItem('returnUrl', window.location.pathname + window.location.search)
            navigate('/login')
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
          予約にはログインが必要です。<Link to="/signup" className="text-primary underline">新規登録はこちら</Link>
        </p>
      )}
    </div>
  )
})

