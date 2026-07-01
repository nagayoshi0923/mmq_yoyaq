/**
 * マイページ - クーポン一覧ページ
 * 保有クーポンと使用履歴を表示
 * クーポンをタップしてもぎる機能付き
 */
import { useState } from 'react'
import { Ticket, Clock, CheckCircle2, XCircle, AlertCircle, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CustomerCoupon, CustomerCouponUsageWithReservation } from '@/types'
import { useCouponsQuery, useCurrentReservationsQuery, useUseCouponMutation } from '../hooks/useCouponsQuery'
import { formatJstDateJa, formatJstDateTime } from '@/utils/jstDate'

function cleanScenarioTitleForCoupon(title?: string | null): string {
  if (!title) return '（タイトル不明）'
  const t = title
    .replace(/【貸切希望】/g, '【貸切】')
    .replace(/（候補\d+件）/g, '')
    .trim()
  return t || '（タイトル不明）'
}

function formatCouponUsagePerformance(usage: CustomerCouponUsageWithReservation): string {
  const res = usage.reservations
  if (!res) {
    return '公演情報を表示できません（予約が削除された場合など）'
  }
  const name = cleanScenarioTitleForCoupon(res.title)
  const store = res.stores?.short_name || res.stores?.name || ''
  const dt = res.requested_datetime
  let when = ''
  if (dt) {
    const datePart = formatJstDateJa(dt)
    const hm = dt.match(/T(\d{2}:\d{2})/)
    const timePart = hm ? hm[1] : ''
    when = timePart ? `${datePart} ${timePart}〜` : datePart
  }
  const parts = [name, store, when].filter(Boolean)
  return parts.join(' ｜ ')
}

interface CurrentReservation {
  id: string
  scenario_title: string
  store_name: string
  date: string
  time: string
}

export function CouponsPage() {
  const [selectedCoupon, setSelectedCoupon] = useState<{ coupon: CustomerCoupon; index: number } | null>(null)
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const { data: coupons = [], isLoading: couponsLoading } = useCouponsQuery()
  const { data: currentReservations = [], isLoading: reservationsLoading } = useCurrentReservationsQuery()
  const useCouponMutation = useUseCouponMutation()

  const loading = couponsLoading || reservationsLoading

  const handleCouponTap = (coupon: CustomerCoupon, index: number) => {
    if (coupon.status !== 'active') return
    setSelectedCoupon({ coupon, index })
    setSelectedReservationId((currentReservations as CurrentReservation[]).length === 1 ? (currentReservations as CurrentReservation[])[0].id : null)
    setShowConfirmDialog(true)
  }

  const handleUseCoupon = async () => {
    if (!selectedCoupon || !selectedReservationId) return
    const result = await useCouponMutation.mutateAsync({
      couponId: selectedCoupon.coupon.id,
      reservationId: selectedReservationId,
    })
    if (result.success) {
      setShowConfirmDialog(false)
      setSelectedCoupon(null)
      setSelectedReservationId(null)
    } else {
      // eslint-disable-next-line no-alert, no-restricted-globals
      alert(result.error || 'クーポンの使用に失敗しました')
    }
  }

  const statusOrder: Record<string, number> = { active: 0, fully_used: 1, expired: 2, revoked: 3 }
  const sortedCoupons = [...coupons].sort(
    (a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)
  )

  const activeCoupons = sortedCoupons.filter(c => c.status === 'active')
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const usedCoupons = sortedCoupons.filter(c => {
    if (c.status === 'active') return false
    if (c.status === 'fully_used') {
      const updatedAt = c.updated_at ? new Date(c.updated_at) : null
      const createdAt = c.created_at ? new Date(c.created_at) : null
      if (updatedAt && updatedAt >= oneMonthAgo) return true
      if (createdAt && createdAt >= oneMonthAgo) return true
      return false
    }
    if (!c.updated_at) return true
    return new Date(c.updated_at) >= oneMonthAgo
  })

  const totalAvailableCount = activeCoupons.reduce((sum, c) => sum + c.uses_remaining, 0)

  const expandedActiveCoupons = activeCoupons.flatMap(coupon => {
    const cards: { coupon: CustomerCoupon; index: number; total: number }[] = []
    for (let i = 0; i < coupon.uses_remaining; i++) {
      cards.push({ coupon, index: i, total: coupon.uses_remaining })
    }
    return cards
  })

  const getStatusBadge = (coupon: CustomerCoupon) => {
    const now = new Date()
    const isExpired = coupon.expires_at && new Date(coupon.expires_at) < now

    if (isExpired && coupon.status === 'active') {
      return { label: '期限切れ', color: 'bg-gray-100 text-gray-600', icon: XCircle }
    }

    switch (coupon.status) {
      case 'active':
        return { label: '利用可能', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
      case 'fully_used':
        return { label: '使用済み', color: 'bg-gray-100 text-gray-600', icon: CheckCircle2 }
      case 'expired':
        return { label: '期限切れ', color: 'bg-gray-100 text-gray-600', icon: XCircle }
      case 'revoked':
        return { label: '無効', color: 'bg-red-100 text-red-600', icon: XCircle }
      default:
        return { label: coupon.status, color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">読み込み中...</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow-sm p-6 border border-gray-200 rounded-none">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-mypage-primary" />
            クーポン
          </h2>
          <span className="text-2xl font-bold text-mypage-primary">
            {totalAvailableCount}枚
          </span>
        </div>
        <p className="ts-muted">
          利用可能なクーポンは予約時に適用できます
        </p>
      </div>

      {expandedActiveCoupons.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-mypage-primary"></span>
            利用可能なクーポン
          </h3>
          <div className="space-y-3">
            {expandedActiveCoupons.map(({ coupon, index }) => {
              const campaign = coupon.coupon_campaigns
              if (!campaign) return null
              const discountLabel = campaign.discount_type === 'fixed'
                ? `¥${campaign.discount_amount.toLocaleString()} OFF`
                : `${campaign.discount_amount}% OFF`

              return (
                <div
                  key={`${coupon.id}-${index}`}
                  className="bg-white border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98] rounded-none"
                  onClick={() => handleCouponTap(coupon, index)}
                >
                  <div
                    className="px-4 py-3 flex items-center justify-between bg-mypage-primary-light"
                  >
                    <div className="flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-mypage-primary" />
                      <span className="text-lg font-bold text-mypage-primary">
                        {discountLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 font-bold flex items-center gap-1">
                        <Scissors className="w-3 h-3" />
                        タップして使う
                      </span>
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <h4 className="font-medium text-gray-900 text-sm">{campaign.name}</h4>
                    {campaign.description && (
                      <p className="ts-muted mt-1">{campaign.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {coupon.expires_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatJstDateJa(coupon.expires_at)}まで
                        </span>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>MMQで予約した公演にご利用いただけます</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>1回のご予約につき1枚使用可能</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>他のクーポンとの併用不可</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>貸切参加でのご利用は貸切リクエストグループに入室する必要があります</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {usedCoupons.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-500 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-gray-300"></span>
            使用済み・期限切れ
          </h3>
          <div className="space-y-2">
            {usedCoupons.map(coupon => {
              const campaign = coupon.coupon_campaigns
              if (!campaign) return null
              const status = getStatusBadge(coupon)
              const StatusIcon = status.icon

              const discountLabel = campaign.discount_type === 'fixed'
                ? `¥${campaign.discount_amount.toLocaleString()} OFF`
                : `${campaign.discount_amount}% OFF`

              const usedAt = coupon.updated_at
                ? formatJstDateTime(coupon.updated_at)
                : null

              const usageRows = (coupon.coupon_usages ?? [])
                .slice()
                .sort((a, b) => new Date(b.used_at).getTime() - new Date(a.used_at).getTime())

              return (
                <div
                  key={coupon.id}
                  className="bg-white border border-gray-200 p-3 opacity-60 rounded-none"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Ticket className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-500">{discountLabel}</span>
                          <span className="text-xs text-gray-500 truncate">- {campaign.name}</span>
                        </div>
                        {usedAt && coupon.status === 'fully_used' && (
                          <p className="text-xs text-gray-400 mt-0.5">{usedAt} 使用</p>
                        )}
                        {usageRows.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            <p className="text-[11px] font-semibold text-gray-500">使用した公演</p>
                            {usageRows.map((u) => (
                              <p
                                key={u.id}
                                className="text-xs text-gray-600 leading-snug pl-2 border-l-2 border-gray-200"
                              >
                                {formatCouponUsagePerformance(u)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${status.color} flex items-center gap-1 shrink-0 ml-2`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {coupons.length === 0 && (
        <div className="bg-white shadow-sm p-8 text-center border border-gray-200 rounded-none">
          <div
            className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-mypage-primary-light rounded-none"
          >
            <Ticket className="w-8 h-8 text-mypage-primary" />
          </div>
          <h3 className="font-bold text-gray-900 mb-2">クーポンはありません</h3>
          <p className="ts-muted">
            キャンペーン実施時にクーポンが付与されます
          </p>
        </div>
      )}

      {showConfirmDialog && selectedCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
            <div
              className="px-5 py-4 text-center bg-mypage-primary-light"
            >
              <Scissors className="w-10 h-10 mx-auto mb-2 text-mypage-primary" />
              <h3 className="font-bold text-lg text-mypage-primary">
                クーポンを使用しますか？
              </h3>
            </div>

            <div className="px-5 py-4">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-center">
                  <span className="text-2xl font-bold text-mypage-primary">
                    {selectedCoupon.coupon.coupon_campaigns?.discount_type === 'fixed'
                      ? `¥${selectedCoupon.coupon.coupon_campaigns.discount_amount.toLocaleString()}`
                      : `${selectedCoupon.coupon.coupon_campaigns?.discount_amount}%`} OFF
                  </span>
                </p>
                <p className="text-center text-sm text-gray-600 mt-1">
                  {selectedCoupon.coupon.coupon_campaigns?.name}
                </p>
              </div>

              {(currentReservations as CurrentReservation[]).length > 0 ? (
                <div className="mb-4">
                  <p className="text-xs text-gray-600 font-bold mb-2">
                    {(currentReservations as CurrentReservation[]).length > 1 ? '紐付ける公演を選択' : '紐付ける公演'}
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(currentReservations as CurrentReservation[]).map((reservation) => (
                      <div
                        key={reservation.id}
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                          selectedReservationId === reservation.id
                            ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedReservationId(reservation.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              selectedReservationId === reservation.id
                                ? 'border-green-500 bg-green-500'
                                : 'border-gray-300'
                            }`}
                          >
                            {selectedReservationId === reservation.id && (
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div className="text-sm flex-1">
                            <p className="font-bold text-gray-900">{reservation.scenario_title}</p>
                            <p className="text-gray-600 text-xs mt-0.5">
                              {reservation.store_name} ｜ {reservation.time}〜
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-yellow-700">
                    ⚠️ 現在進行中の予約がありません。<br />
                    公演の前後3時間以内に使用してください。
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-500 text-center mb-4">
                使用後は元に戻せません
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowConfirmDialog(false)
                    setSelectedCoupon(null)
                    setSelectedReservationId(null)
                  }}
                  disabled={useCouponMutation.isPending}
                >
                  キャンセル
                </Button>
                <Button
                  className={`flex-1 ${selectedReservationId ? 'bg-mypage-primary hover:bg-mypage-primary-hover' : 'bg-gray-400 hover:bg-gray-400'}`}
                  onClick={handleUseCoupon}
                  disabled={useCouponMutation.isPending || !selectedReservationId}
                >
                  {useCouponMutation.isPending ? '処理中...' : 'もぎる'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
