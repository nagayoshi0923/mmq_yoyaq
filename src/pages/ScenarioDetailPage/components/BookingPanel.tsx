import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface BookingPanelProps {
  participantCount: number
  maxParticipants: number
  participationFee: number
  selectedEventId: string | null
  isLoggedIn: boolean
  onParticipantCountChange: (count: number) => void
  onBooking: () => void
}

export const BookingPanel = memo(function BookingPanel({
  participantCount,
  maxParticipants,
  participationFee,
  selectedEventId,
  isLoggedIn,
  onParticipantCountChange,
  onBooking
}: BookingPanelProps) {
  return (
    <div className="space-y-6">
      {/* 人数を選択 */}
      <div>
        <h3 className="font-bold mb-3">人数を選択</h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">予約人数</span>
              <select 
                className="border rounded px-3 py-1.5 text-sm"
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

      {/* 料金情報 */}
      <div>
        <h3 className="font-bold mb-3">料金</h3>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">参加費（1名）</span>
                <span className="font-medium">
                  ¥{participationFee.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">人数</span>
                <span className="font-medium">× {participantCount}名</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-bold">合計</span>
                <span className="text-2xl font-bold text-blue-600">
                  ¥{(participationFee * participantCount).toLocaleString()}
                </span>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">現地決済</p>
                <p className="text-xs">当日会場にてお支払いください</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 予約確認ボタン */}
      <Button 
        className="w-full bg-blue-600 text-white hover:bg-blue-700 h-12 font-bold"
        onClick={onBooking}
        disabled={!selectedEventId || !isLoggedIn}
      >
        {!isLoggedIn ? 'ログインして予約する' : !selectedEventId ? '日付を選択してください' : '予約確認へ進む'}
      </Button>
    </div>
  )
})

