/**
 * マイページ - クーポン一覧ページ
 * 保有クーポンと使用履歴を表示
 */
import { useState, useEffect } from 'react'
import { Ticket, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { getAllCoupons } from '@/lib/api/couponApi'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import type { CustomerCoupon } from '@/types'

export function CouponsPage() {
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCoupons = async () => {
      setLoading(true)
      try {
        const data = await getAllCoupons()
        setCoupons(data)
      } catch {
        // エラーはcouponApi内でログ出力済み
      } finally {
        setLoading(false)
      }
    }
    fetchCoupons()
  }, [])

  // クーポンをステータスでソート（active → fully_used → expired → revoked）
  const statusOrder: Record<string, number> = { active: 0, fully_used: 1, expired: 2, revoked: 3 }
  const sortedCoupons = [...coupons].sort(
    (a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)
  )

  const activeCoupons = sortedCoupons.filter(c => c.status === 'active')
  const usedCoupons = sortedCoupons.filter(c => c.status !== 'active')

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
      {/* ヘッダー */}
      <div className="bg-white shadow-sm p-6 border border-gray-200" style={{ borderRadius: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Ticket className="w-5 h-5" style={{ color: THEME.primary }} />
            クーポン
          </h2>
          <span className="text-2xl font-bold" style={{ color: THEME.primary }}>
            {activeCoupons.length}枚
          </span>
        </div>
        <p className="text-sm text-gray-500">
          利用可能なクーポンは予約時に適用できます
        </p>
      </div>

      {/* 利用可能クーポン */}
      {activeCoupons.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full" style={{ backgroundColor: THEME.primary }}></span>
            利用可能なクーポン
          </h3>
          <div className="space-y-3">
            {activeCoupons.map(coupon => {
              const campaign = coupon.coupon_campaigns
              if (!campaign) return null
              const status = getStatusBadge(coupon)
              const StatusIcon = status.icon

              const discountLabel = campaign.discount_type === 'fixed'
                ? `¥${campaign.discount_amount.toLocaleString()} OFF`
                : `${campaign.discount_amount}% OFF`

              return (
                <div
                  key={coupon.id}
                  className="bg-white border border-gray-200 overflow-hidden"
                  style={{ borderRadius: 0 }}
                >
                  {/* クーポン上部 - 割引額 */}
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{ backgroundColor: THEME.primaryLight }}
                  >
                    <div className="flex items-center gap-2">
                      <Ticket className="w-5 h-5" style={{ color: THEME.primary }} />
                      <span className="text-lg font-bold" style={{ color: THEME.primary }}>
                        {discountLabel}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${status.color} flex items-center gap-1`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>

                  {/* クーポン詳細 */}
                  <div className="px-4 py-3">
                    <h4 className="font-medium text-gray-900 text-sm">{campaign.name}</h4>
                    {campaign.description && (
                      <p className="text-xs text-gray-500 mt-1">{campaign.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Ticket className="w-3 h-3" />
                        残り{coupon.uses_remaining}/{campaign.max_uses_per_customer}回
                      </span>
                      {coupon.expires_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(coupon.expires_at).toLocaleDateString('ja-JP')}まで
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 使用済み・期限切れクーポン */}
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

              return (
                <div
                  key={coupon.id}
                  className="bg-white border border-gray-200 p-3 opacity-60"
                  style={{ borderRadius: 0 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">{discountLabel}</span>
                      <span className="text-xs text-gray-500">- {campaign.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${status.color} flex items-center gap-1`}>
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

      {/* クーポンが一つもない場合 */}
      {coupons.length === 0 && (
        <div className="bg-white shadow-sm p-8 text-center border border-gray-200" style={{ borderRadius: 0 }}>
          <div
            className="w-16 h-16 flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
          >
            <Ticket className="w-8 h-8" style={{ color: THEME.primary }} />
          </div>
          <h3 className="font-bold text-gray-900 mb-2">クーポンはありません</h3>
          <p className="text-gray-500 text-sm">
            キャンペーン実施時にクーポンが付与されます
          </p>
        </div>
      )}
    </div>
  )
}
