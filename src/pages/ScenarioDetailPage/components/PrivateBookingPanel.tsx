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
        <h3 className="font-bold mb-3">料金（目安）</h3>
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
                <span className="text-muted-foreground">最大人数</span>
                <span className="font-medium">× {maxParticipants}名</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-bold">合計</span>
                <span className="text-2xl font-bold text-purple-600">
                  ¥{(participationFee * maxParticipants).toLocaleString()}
                </span>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm text-purple-800">
                <p className="font-medium mb-1">貸切料金</p>
                <p className="text-xs">詳細はリクエスト後にご相談</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 貸切リクエスト送信ボタン */}
      <Button 
        className="w-full bg-purple-600 text-white hover:bg-purple-700 h-12 font-bold"
        onClick={onRequestBooking}
        disabled={!isLoggedIn || selectedTimeSlotsCount === 0}
      >
        {!isLoggedIn ? 'ログインして貸切リクエスト' : selectedTimeSlotsCount === 0 ? '候補日時を選択してください' : `貸切リクエスト確認へ (${selectedTimeSlotsCount}件)`}
      </Button>
    </div>
  )
})

