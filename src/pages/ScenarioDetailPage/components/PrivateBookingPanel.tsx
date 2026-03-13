import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, CalendarPlus } from 'lucide-react'
import { BookingNotice } from './BookingNotice'

interface PrivateBookingPanelProps {
  participationFee: number
  maxParticipants: number
  selectedTimeSlotsCount: number
  isLoggedIn: boolean
  onRequestBooking: () => void
  reservationDeadlineHours?: number
  hasPreReading?: boolean
  scenarioId?: string
  organizationSlug?: string
}

export const PrivateBookingPanel = memo(function PrivateBookingPanel({
  participationFee,
  maxParticipants,
  selectedTimeSlotsCount,
  isLoggedIn,
  onRequestBooking,
  reservationDeadlineHours,
  hasPreReading,
  scenarioId,
  organizationSlug
}: PrivateBookingPanelProps) {
  const navigate = useNavigate()

  const handleCreateGroupWithoutDates = () => {
    if (!isLoggedIn) {
      navigate('/login')
      return
    }
    const params = new URLSearchParams()
    if (scenarioId) params.set('scenarioId', scenarioId)
    if (organizationSlug) params.set('org', organizationSlug)
    params.set('mode', 'no-dates')
    navigate(`/group/create?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* 日程を決めないで作成するボタン（上部） */}
      {scenarioId && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="p-4">
            <p className="text-sm text-purple-800 mb-3">
              日程が決まっていない場合は、先に貸切リクエストを作成してメンバーを招待できます
            </p>
            <Button 
              variant="outline"
              className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={handleCreateGroupWithoutDates}
            >
              <Users className="w-4 h-4" />
              {isLoggedIn ? '日程を決めないで貸切リクエストを作成' : 'ログインして貸切リクエストを作成'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 貸切料金情報 */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">料金</h3>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">参加費（1名）</span>
              <span className="font-medium">¥{participationFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">人数</span>
              <span className="font-medium">{maxParticipants}名</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">合計</span>
                <span className="text-base font-bold text-[#E60012]">
                  ¥{(participationFee * maxParticipants).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ※ 実際の料金は店舗との調整により変動する場合があります
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 注意事項（ボタンの上に表示） */}
      <BookingNotice 
        reservationDeadlineHours={reservationDeadlineHours}
        hasPreReading={hasPreReading}
        mode="private"
      />

      {/* 貸切リクエスト送信ボタン */}
      <Button 
        className="w-full h-10 text-base bg-[#E60012] hover:bg-[#CC0010]"
        onClick={onRequestBooking}
        disabled={!isLoggedIn || selectedTimeSlotsCount === 0}
      >
        {!isLoggedIn ? 'ログインして貸切リクエスト' : selectedTimeSlotsCount === 0 ? '候補日時を選択してください' : `貸切リクエスト確認へ (${selectedTimeSlotsCount}件)`}
      </Button>
    </div>
  )
})

