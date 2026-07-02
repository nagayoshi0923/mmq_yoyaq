/**
 * 顧客別 クーポン管理（管理画面・スタッフ用 / 予約台帳 Step C）。
 *
 * - 保有クーポン一覧（自組織が配布した分）
 * - 付与: キャンペーンを選んで grantCouponToCustomer
 * - 取消: 未使用クーポンを revokeCoupon（使用履歴ありは不可＝バックエンドで弾く）
 * すべて /api/coupons 経由（org は JWT 由来）。
 */
import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Ticket, Plus, X } from 'lucide-react'
import { getCustomerCoupons, getCampaigns, grantCouponToCustomer, revokeCoupon, adjustCouponUses } from '@/lib/api/couponApi'
import type { CustomerCoupon, CouponCampaign } from '@/types'
import { formatJstYmd } from '@/utils/jstDate'
import { ConfirmDialog } from '@/components/patterns/modal'

interface CustomerCouponManagerProps {
  customerId: string
}

function discountLabel(c?: CouponCampaign | null): string {
  if (!c) return ''
  return c.discount_type === 'percentage' ? `${c.discount_amount}%` : `¥${c.discount_amount.toLocaleString()}`
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: '有効', cls: 'text-green-700 border-green-300' },
  fully_used: { label: '使用済み', cls: 'text-gray-500 border-gray-300' },
  expired: { label: '期限切れ', cls: 'text-gray-500 border-gray-300' },
  revoked: { label: '取消済み', cls: 'text-red-600 border-red-300' },
}

export function CustomerCouponManager({ customerId }: CustomerCouponManagerProps) {
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([])
  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [grantCampaignId, setGrantCampaignId] = useState('')
  const [grantUses, setGrantUses] = useState('')
  // 保有クーポンの残回数編集（couponId -> 入力中の値）
  const [editUses, setEditUses] = useState<Record<string, string>>({})
  // 取消確認ダイアログ対象のクーポンID
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, camps] = await Promise.all([getCustomerCoupons(customerId), getCampaigns()])
      setCoupons(c)
      setCampaigns(camps.filter(camp => camp.is_active))
    } catch (error) {
      logger.error('クーポン管理データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { load() }, [load])

  const grant = async () => {
    if (!grantCampaignId) { showToast.error('キャンペーンを選択してください'); return }
    const usesNum = grantUses ? parseInt(grantUses, 10) : NaN
    const uses = Number.isFinite(usesNum) && usesNum >= 1 ? usesNum : undefined
    setBusy(true)
    try {
      const result = await grantCouponToCustomer(grantCampaignId, customerId, uses)
      if (!result.success) {
        showToast.error(result.error || '付与に失敗しました')
        return
      }
      setGrantCampaignId('')
      setGrantUses('')
      showToast.success('クーポンを付与しました')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const onSelectCampaign = (id: string) => {
    setGrantCampaignId(id)
    const camp = campaigns.find(c => c.id === id)
    setGrantUses(camp ? String(camp.max_uses_per_customer) : '')
  }

  const applyUses = async (c: CustomerCoupon) => {
    const raw = editUses[c.id]
    const n = raw != null ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(n) || n < 0) { showToast.error('0以上の数値を入力してください'); return }
    if (n === c.uses_remaining) return
    setBusy(true)
    try {
      const result = await adjustCouponUses(c.id, n)
      if (!result.success) {
        showToast.error(result.error || '調整に失敗しました')
        return
      }
      setEditUses(prev => { const next = { ...prev }; delete next[c.id]; return next })
      showToast.success('残回数を更新しました')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const revoke = (couponId: string) => {
    setRevokeTargetId(couponId)
  }

  const runRevoke = async () => {
    const couponId = revokeTargetId
    if (!couponId) return
    setBusy(true)
    try {
      const result = await revokeCoupon(couponId)
      if (!result.success) {
        showToast.error(result.error || '取消に失敗しました')
        return
      }
      showToast.success('クーポンを取消しました')
      await load()
    } finally {
      setBusy(false)
    }
  }

  // 未使用（取消可能）か: 有効 かつ 残数 == キャンペーンの上限
  const isUnused = (c: CustomerCoupon) =>
    c.status === 'active' && c.coupon_campaigns != null && c.uses_remaining === c.coupon_campaigns.max_uses_per_customer

  return (
    <div>
      <h4 className="mb-2 font-bold text-sm flex items-center gap-2">
        <Ticket className="h-4 w-4" />
        クーポン操作
      </h4>
      {loading ? (
        <div className="text-center py-4 text-xs text-muted-foreground">読み込み中...</div>
      ) : (
        <div className="space-y-3">
          {/* 付与フォーム */}
          <div className="flex flex-col sm:flex-row gap-2 p-3 bg-background rounded-lg border">
            <select
              value={grantCampaignId}
              onChange={e => onSelectCampaign(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-input rounded px-2 h-9 bg-background"
            >
              <option value="">クーポンを選んで付与...</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}（{discountLabel(c)}）</option>
              ))}
            </select>
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={1}
                value={grantUses}
                onChange={e => setGrantUses(e.target.value)}
                disabled={!grantCampaignId}
                className="w-16 text-sm border border-input rounded px-2 h-9 bg-background"
                title="使用回数"
              />
              <span className="text-xs text-muted-foreground">回</span>
            </div>
            <Button size="sm" disabled={busy || !grantCampaignId} className="h-9 shrink-0" onClick={grant}>
              <Plus className="h-4 w-4 mr-1" />付与
            </Button>
          </div>

          {/* 保有一覧 */}
          <div className="p-3 bg-background rounded-lg border">
            <div className="text-xs text-muted-foreground mb-2">保有クーポン（{coupons.length}件）</div>
            {coupons.length === 0 ? (
              <div className="text-xs text-muted-foreground">なし</div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {coupons.map(c => {
                  const st = STATUS_LABEL[c.status] ?? { label: c.status, cls: 'text-gray-500 border-gray-300' }
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-sm truncate">{c.coupon_campaigns?.name || 'クーポン'}</span>
                        <span className="text-xs text-muted-foreground">{discountLabel(c.coupon_campaigns)}</span>
                        <Badge variant="outline" className={`text-[10px] font-normal ${st.cls}`}>{st.label}</Badge>
                        {/* 残回数の調整（店舗で利用失敗した等で直す） */}
                        <span className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">残</span>
                          <input
                            type="number"
                            min={0}
                            value={editUses[c.id] ?? String(c.uses_remaining)}
                            onChange={e => setEditUses(prev => ({ ...prev, [c.id]: e.target.value }))}
                            disabled={busy || c.status === 'revoked'}
                            className="w-12 h-6 text-xs border border-input rounded px-1 bg-background"
                          />
                          <span className="text-[10px] text-muted-foreground">回</span>
                          {editUses[c.id] != null && parseInt(editUses[c.id], 10) !== c.uses_remaining && (
                            <Button size="sm" disabled={busy} className="h-6 px-1.5 text-[10px] shrink-0" onClick={() => applyUses(c)}>適用</Button>
                          )}
                        </span>
                        {c.expires_at && <span className="text-[10px] text-muted-foreground">〜{formatJstYmd(c.expires_at)}</span>}
                      </div>
                      {isUnused(c) && (
                        <Button variant="outline" size="sm" disabled={busy} className="h-7 px-2 text-xs text-red-600 border-red-300 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => revoke(c.id)}>
                          <X className="h-3 w-3 mr-1" />取消
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 取消確認ダイアログ */}
      <ConfirmDialog
        open={revokeTargetId !== null}
        onOpenChange={(open) => { if (!open) setRevokeTargetId(null) }}
        title="このクーポンを取消しますか？"
        description="誤付与の取り消し"
        confirmLabel="取消する"
        variant="destructive"
        onConfirm={runRevoke}
      />
    </div>
  )
}
