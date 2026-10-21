import { memo } from 'react'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, CalendarPlus } from 'lucide-react'
import { BookingNotice } from './BookingNotice'
import { privateGroupCreatePath } from '@/pages/PrivateBookingStart/paths'

interface PrivateBookingPanelProps {
  participationFee: number
  maxParticipationFee?: number
  maxParticipants: number
  selectedTimeSlotsCount: number
  isLoggedIn: boolean
  availabilityReady?: boolean
  onRequestBooking: () => void
  reservationDeadlineHours?: number
  hasPreReading?: boolean
  scenarioId?: string
  organizationSlug?: string
  /** 貸切タブでいま選んでいる希望店舗。グループ作成ページへ同じ店舗で引き継ぐ */
  preferredStoreIds?: string[]
}

export const PrivateBookingPanel = memo(function PrivateBookingPanel({
  participationFee,
  maxParticipationFee,
  maxParticipants,
  selectedTimeSlotsCount,
  isLoggedIn,
  availabilityReady = true,
  onRequestBooking,
  reservationDeadlineHours,
  hasPreReading,
  scenarioId,
  organizationSlug,
  preferredStoreIds = [],
}: PrivateBookingPanelProps) {
  const navigate = useNavigate()

  const handleCreateGroupWithoutDates = () => {
    // グループ作成ページのURLを構築（希望店舗は作品ページの他のボタンと同じく引き継ぐ）
    const groupCreateUrl = privateGroupCreatePath({ scenarioMasterId: scenarioId, organizationSlug, storeIds: preferredStoreIds, noDates: true })

    if (!isLoggedIn) {
      // 戻り先（グループ作成ページ）を付けてログインへ
      navigate(loginUrlWithIntent('login', groupCreateUrl, '貸切グループの作成'))
      return
    }
    navigate(groupCreateUrl)
  }

  return (
    <div className="space-y-4">
      {/* 日程を決めないで作成するボタン（上部） */}
      {scenarioId && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="p-4">
            <p className="text-xs text-purple-800 mb-3">
              日程やメンバーが決まっていない場合
            </p>
            <Button 
              variant="outline"
              className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={handleCreateGroupWithoutDates}
            >
              <Users className="w-4 h-4" />
              まずはメンバーを招待して貸切グループを作成
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 貸切料金情報 */}
      <div>
        <h3 className="ts-label">料金</h3>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between">
              <span className="ts-muted">参加費（1名）</span>
              <span className="ts-body font-medium">¥{participationFee.toLocaleString()}{maxParticipationFee != null && maxParticipationFee !== participationFee ? `〜¥${maxParticipationFee.toLocaleString()}` : selectedTimeSlotsCount === 0 ? '〜' : ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="ts-muted">人数</span>
              <span className="ts-body font-medium">{maxParticipants}名</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="ts-muted">合計</span>
                <span className="ts-emph text-purple-600">
                  ¥{(participationFee * maxParticipants).toLocaleString()}{maxParticipationFee != null && maxParticipationFee !== participationFee ? `〜¥${(maxParticipationFee * maxParticipants).toLocaleString()}` : selectedTimeSlotsCount === 0 ? '〜' : ''}
                </span>
              </div>
              <p className="ts-caption mt-1">
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
        scenarioMasterId={scenarioId}
        organizationSlug={organizationSlug}
      />

      {/* 貸切リクエスト送信ボタン */}
      {!availabilityReady && selectedTimeSlotsCount > 0 && <p role="status" className="text-sm text-muted-foreground">空き状況を確認できるまで選択した候補を保持します。通信を確認して空き状況を再読み込みしてください。</p>}
      <Button
        className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700"
        onClick={onRequestBooking}
        disabled={isLoggedIn && (selectedTimeSlotsCount === 0 || !availabilityReady)}
      >
        {!isLoggedIn ? 'ログインして貸切リクエスト' : selectedTimeSlotsCount === 0 ? '候補日時を選択してください' : `貸切リクエスト確認へ (${selectedTimeSlotsCount}件)`}
      </Button>
    </div>
  )
})

