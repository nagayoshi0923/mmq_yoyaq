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
    <div className="space-y-4 sm:space-y-6">
      {/* 貸切料金情報 */}
      <div>
        <h3 className="mb-3 sm:mb-4 text-base sm:text-lg">料金（目安）</h3>
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="flex justify-between items-center text-sm sm:text-base">
                <span className="text-muted-foreground">参加費（1名）</span>
                <span className="">
                  ¥{participationFee.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm sm:text-base">
                <span className="text-muted-foreground">最大人数</span>
                <span className="">× {maxParticipants}名</span>
              </div>
              <div className="border-t pt-2 sm:pt-3 flex justify-between items-center">
                <span className="text-base sm:text-lg">合計</span>
                <span className="text-base sm:text-lg text-purple-600">
                  ¥{(participationFee * maxParticipants).toLocaleString()}
                </span>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded p-2 sm:p-3 text-sm sm:text-base text-purple-800">
                <p className="mb-0.5 sm:mb-1">貸切料金</p>
                <p className="text-xs sm:text-sm">詳細はリクエスト後にご相談</p>
              </div>
          </CardContent>
        </Card>
      </div>

      {/* 貸切リクエスト送信ボタン */}
      <Button 
        className="w-full bg-purple-600 text-white hover:bg-purple-700 h-10 sm:h-11 text-sm sm:text-base touch-manipulation"
        onClick={onRequestBooking}
        disabled={!isLoggedIn || selectedTimeSlotsCount === 0}
      >
        {!isLoggedIn ? 'ログインして貸切リクエスト' : selectedTimeSlotsCount === 0 ? '候補日時を選択してください' : `貸切リクエスト確認へ (${selectedTimeSlotsCount}件)`}
      </Button>
    </div>
  )
})

