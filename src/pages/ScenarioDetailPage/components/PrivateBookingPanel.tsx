import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PrivateBookingPanelProps {
  participationFee: number
  maxParticipants: number
  selectedTimeSlotsCount: number
  isLoggedIn: boolean
  onRequestBooking: () => void
}

export const PrivateBookingPanel = memo(function PrivateBookingPanel({
  participationFee,
  maxParticipants,
  selectedTimeSlotsCount,
  isLoggedIn,
  onRequestBooking
}: PrivateBookingPanelProps) {
  return (
    <div className="space-y-6">
      {/* 貸切料金情報 */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">料金（目安）</h3>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">参加費（1名）</span>
              <span className="font-medium">¥{participationFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">最大人数</span>
              <span className="font-medium">{maxParticipants}名</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">合計</span>
                <span className="text-base font-bold text-purple-600">
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

      {/* 貸切リクエスト送信ボタン */}
      <Button 
        className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700"
        onClick={onRequestBooking}
        disabled={!isLoggedIn || selectedTimeSlotsCount === 0}
      >
        {!isLoggedIn ? 'ログインして貸切リクエスト' : selectedTimeSlotsCount === 0 ? '候補日時を選択してください' : `貸切リクエスト確認へ (${selectedTimeSlotsCount}件)`}
      </Button>
    </div>
  )
})

