/**
 * マイページのクーポン:「この予約に適用済み」（社長決定 B、2026-10-20）。
 * 予約時に付けたクーポンは予約確定の時点で使用済みになる。来店時にこの欄の「もぎる（来店確認）」を
 * スタッフの前で押すと「来店時に確認済み」になる（クーポンが新たに使われることはない）。
 */
import { useState } from 'react'
import { CheckCircle2, Scissors, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatJstDateJa, formatJstDateTime, formatJstMonthDay, formatJstTime, toJstYmd } from '@/utils/jstDate'
import { showToast } from '@/utils/toast'
import type { AppliedCouponCard } from '../utils/appliedCoupons'

interface AppliedCouponsSectionProps {
  cards: AppliedCouponCard[]
  onRedeem: (usageId: string) => Promise<{ success: boolean; error?: string; code?: string }>
  redeeming: boolean
}

/** 来店確認は公演当日（日本時間）だけ押せる。サーバーも同じ判定で断る（20261020180000） */
export function isPerformanceDay(startsAt: string, now: Date = new Date()): boolean {
  const day = toJstYmd(startsAt)
  return !!day && day === toJstYmd(now)
}

export function AppliedCouponsSection({ cards, onRedeem, redeeming }: AppliedCouponsSectionProps) {
  const [target, setTarget] = useState<AppliedCouponCard | null>(null)
  if (cards.length === 0) return null

  const handleConfirm = async () => {
    if (!target) return
    const result = await onRedeem(target.usageId)
    if (result.success) {
      setTarget(null)
      showToast.success('来店確認をしました。この画面をスタッフにお見せください')
    } else {
      showToast.error(result.code === 'not_performance_day'
        ? `来店確認は公演当日（${formatJstMonthDay(target.startsAt)}）に押してください`
        : result.error || '来店確認を記録できませんでした')
      if (result.code === 'not_performance_day') setTarget(null)
    }
  }

  return (
    <div data-testid="applied-coupons">
      <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-mypage-primary"></span>
        この予約に適用済みのクーポン
      </h3>
      <p className="ts-muted mb-3">ご予約時に割引済みです。来店時にスタッフの前で「もぎる」を押してください。</p>
      <div className="space-y-3">
        {cards.map(card => (
          <div key={card.usageId} className="bg-white border border-gray-200 overflow-hidden rounded-none" data-testid="applied-coupon-card">
            <div className="px-4 py-3 flex items-center justify-between bg-mypage-primary-light">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-mypage-primary" />
                <span className="text-lg font-bold text-mypage-primary">¥{card.discountAmount.toLocaleString()} OFF</span>
              </div>
              <span className="text-xs px-2 py-1 bg-white text-mypage-primary font-bold">この予約に適用済み</span>
            </div>
            <div className="px-4 py-3">
              <h4 className="font-medium text-foreground text-sm">{card.campaignName}</h4>
              <p className="ts-body text-foreground mt-1 font-bold">{card.reservationTitle}</p>
              <p className="ts-muted mt-0.5">
                {[card.storeName, `${formatJstDateJa(card.startsAt, true)} ${formatJstTime(card.startsAt)}〜`].filter(Boolean).join(' ｜ ')}
              </p>
              {card.redeemedAt ? (
                <div className="mt-3 flex items-center gap-2 border border-green-200 bg-green-50 px-3 py-2 text-green-700" data-testid="applied-coupon-redeemed">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-bold">来店時に確認済み</span>
                  <span className="text-xs ml-auto">{formatJstDateTime(card.redeemedAt)}</span>
                </div>
              ) : isPerformanceDay(card.startsAt) ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">来店確認: 未確認</span>
                  <Button
                    className="bg-mypage-primary hover:bg-mypage-primary-hover min-h-11"
                    onClick={() => setTarget(card)}
                  >
                    <Scissors className="w-4 h-4 mr-1" aria-hidden="true" />
                    もぎる（来店確認）
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3" data-testid="applied-coupon-not-today">
                  <span className="text-xs text-muted-foreground">公演当日に押せます（{formatJstMonthDay(card.startsAt)}）</span>
                  <Button className="min-h-11" variant="outline" disabled aria-disabled="true">
                    <Scissors className="w-4 h-4 mr-1" aria-hidden="true" />
                    もぎる（来店確認）
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="applied-coupon-confirm-title">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 text-center bg-mypage-primary-light">
              <Scissors className="w-10 h-10 mx-auto mb-2 text-mypage-primary" />
              <h3 id="applied-coupon-confirm-title" className="font-bold text-lg text-mypage-primary">来店確認として「もぎる」を押しますか？</h3>
            </div>
            <div className="px-5 py-4">
              <div className="bg-gray-50 rounded-lg p-4 mb-4 text-center">
                <p className="text-2xl font-bold text-mypage-primary">¥{target.discountAmount.toLocaleString()} OFF</p>
                <p className="text-sm text-muted-foreground mt-1">{target.campaignName}</p>
                <p className="text-sm text-foreground mt-2 font-bold">{target.reservationTitle}</p>
                <p className="text-xs text-muted-foreground">{formatJstDateJa(target.startsAt, true)} {formatJstTime(target.startsAt)}〜</p>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-4">
                このクーポンはご予約時に割引済みです。押しても新たにクーポンは使われません。スタッフの前で押してください。
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setTarget(null)} disabled={redeeming}>キャンセル</Button>
                <Button className="flex-1 bg-mypage-primary hover:bg-mypage-primary-hover" onClick={() => void handleConfirm()} disabled={redeeming}>
                  {redeeming ? '処理中...' : 'もぎる'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
