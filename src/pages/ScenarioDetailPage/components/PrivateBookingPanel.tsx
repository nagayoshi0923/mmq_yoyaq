import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookingNotice } from './BookingNotice'

interface PrivateBookingPanelProps {
  participationFee: number
  maxParticipationFee?: number
  /** 料金が未確定（組織の独自休日を読み込み中・読み込めなかった）ときに金額の代わりに出す文。null なら金額を出す */
  feeUnknownText?: string | null
  maxParticipants: number
  selectedTimeSlotsCount: number
  isLoggedIn: boolean
  availabilityReady?: boolean
  onRequestBooking: () => void
  reservationDeadlineHours?: number
  hasPreReading?: boolean
  scenarioId?: string
  organizationSlug?: string
  /** 互換のため受け取る（グループ作成の入口は貸切タブ上部の PrivateBookingEntryChoice に移した） */
  preferredStoreIds?: string[]
}

export const PrivateBookingPanel = memo(function PrivateBookingPanel({
  participationFee,
  maxParticipationFee,
  feeUnknownText = null,
  maxParticipants,
  selectedTimeSlotsCount,
  isLoggedIn,
  availabilityReady = true,
  onRequestBooking,
  reservationDeadlineHours,
  hasPreReading,
  scenarioId,
  organizationSlug,
}: PrivateBookingPanelProps) {
  return (
    <div className="space-y-4">
      {/* 「まだ決まっていない（グループ作成）」の入口は貸切タブの一番上だけに出す（2026-11-14 段階1。以前はここにも同じボタンがあった） */}
      {/* 貸切料金情報 */}
      <div>
        <h3 className="ts-label">料金</h3>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between">
              <span className="ts-muted">参加費（1名）</span>
              <span className="ts-body font-medium">{feeUnknownText ?? `¥${participationFee.toLocaleString()}${maxParticipationFee != null && maxParticipationFee !== participationFee ? `〜¥${maxParticipationFee.toLocaleString()}` : selectedTimeSlotsCount === 0 ? '〜' : ''}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="ts-muted">人数</span>
              <span className="ts-body font-medium">{maxParticipants}名</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="ts-muted">合計</span>
                <span className="ts-emph text-purple-600">
                  {feeUnknownText ?? `¥${(participationFee * maxParticipants).toLocaleString()}${maxParticipationFee != null && maxParticipationFee !== participationFee ? `〜¥${(maxParticipationFee * maxParticipants).toLocaleString()}` : selectedTimeSlotsCount === 0 ? '〜' : ''}`}
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

