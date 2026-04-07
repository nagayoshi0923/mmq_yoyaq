import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Gift, Users, CheckCircle, Ticket, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import {
  getCampaignStats,
  getCampaignCoupons,
  getCouponUsagesForAdmin,
  restoreCouponUsage,
  type CampaignStats as StatsType,
} from '@/lib/api/couponApi'
import type { CouponCampaign, CustomerCoupon } from '@/types'
import { toast } from 'sonner'

interface CampaignStatsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: CouponCampaign | null
}

type CouponWithCustomer = CustomerCoupon & { 
  customers?: { name: string; email: string } 
}

interface UsageRecord {
  id: string
  reservation_id: string | null
  discount_amount: number
  used_at: string
  reservation_title: string | null
}

export function CampaignStats({
  open,
  onOpenChange,
  campaign
}: CampaignStatsProps) {
  const [stats, setStats] = useState<StatsType | null>(null)
  const [coupons, setCoupons] = useState<CouponWithCustomer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedCouponId, setExpandedCouponId] = useState<string | null>(null)
  const [usages, setUsages] = useState<Record<string, UsageRecord[]>>({})
  const [usageLoading, setUsageLoading] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<{ usageId: string; couponId: string; title: string | null } | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadData = useCallback(async () => {
    if (!campaign) return

    setIsLoading(true)
    try {
      const [statsData, couponsData] = await Promise.all([
        getCampaignStats(campaign.id),
        getCampaignCoupons(campaign.id)
      ])
      setStats(statsData)
      setCoupons(couponsData)
    } finally {
      setIsLoading(false)
    }
  }, [campaign])

  useEffect(() => {
    if (open && campaign) {
      loadData()
      setExpandedCouponId(null)
      setUsages({})
    }
  }, [open, campaign, loadData])

  const handleToggleUsages = async (couponId: string) => {
    if (expandedCouponId === couponId) {
      setExpandedCouponId(null)
      return
    }
    setExpandedCouponId(couponId)
    if (!usages[couponId]) {
      setUsageLoading(couponId)
      try {
        const data = await getCouponUsagesForAdmin(couponId)
        setUsages(prev => ({ ...prev, [couponId]: data }))
      } finally {
        setUsageLoading(null)
      }
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const result = await restoreCouponUsage(restoreTarget.usageId, restoreTarget.couponId)
      if (result.success) {
        toast.success('クーポン使用を取り消しました')
        setUsages(prev => ({
          ...prev,
          [restoreTarget.couponId]: (prev[restoreTarget.couponId] || []).filter(u => u.id !== restoreTarget.usageId)
        }))
        await loadData()
      } else {
        toast.error(result.error || '復元に失敗しました')
      }
    } finally {
      setRestoring(false)
      setRestoreTarget(null)
    }
  }

  if (!campaign) return null

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">有効</Badge>
      case 'fully_used':
        return <Badge variant="secondary">使用済</Badge>
      case 'expired':
        return <Badge variant="outline">期限切れ</Badge>
      case 'revoked':
        return <Badge variant="destructive">取消</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>キャンペーン統計</DialogTitle>
            <DialogDescription>
              「{campaign.name}」の付与・使用状況
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Users className="h-4 w-4" />
                      付与数
                    </div>
                    <div className="text-2xl font-bold">{stats.totalGranted}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <CheckCircle className="h-4 w-4" />
                      使用回数
                    </div>
                    <div className="text-2xl font-bold">{stats.totalUsed}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Ticket className="h-4 w-4" />
                      残り回数
                    </div>
                    <div className="text-2xl font-bold">{stats.totalRemaining}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Gift className="h-4 w-4" />
                      割引総額
                    </div>
                    <div className="text-2xl font-bold">¥{stats.totalDiscountAmount.toLocaleString()}</div>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                <h4 className="font-medium mb-2">付与済みクーポン一覧</h4>
                {coupons.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    まだクーポンが付与されていません
                  </div>
                ) : (
                  <ScrollArea className="h-[350px] border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>顧客</TableHead>
                          <TableHead className="w-[80px]">残り回数</TableHead>
                          <TableHead className="w-[80px]">状態</TableHead>
                          <TableHead className="w-[90px]">有効期限</TableHead>
                          <TableHead className="w-[60px]">履歴</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coupons.map((coupon) => (
                          <>
                            <TableRow
                              key={coupon.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => handleToggleUsages(coupon.id)}
                            >
                              <TableCell>
                                <div>
                                  <div className="font-medium">
                                    {coupon.customers?.name || '不明'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {coupon.customers?.email || ''}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{coupon.uses_remaining}</TableCell>
                              <TableCell>{getStatusBadge(coupon.status)}</TableCell>
                              <TableCell className="text-sm">
                                {coupon.expires_at ? formatDate(coupon.expires_at) : '-'}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  {expandedCouponId === coupon.id
                                    ? <ChevronUp className="h-4 w-4" />
                                    : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                            {expandedCouponId === coupon.id && (
                              <TableRow key={`${coupon.id}-usages`}>
                                <TableCell colSpan={5} className="p-0">
                                  <div className="bg-muted/30 px-4 py-3">
                                    <div className="text-xs font-medium text-muted-foreground mb-2">使用履歴</div>
                                    {usageLoading === coupon.id ? (
                                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        読み込み中...
                                      </div>
                                    ) : (usages[coupon.id] || []).length === 0 ? (
                                      <div className="text-xs text-muted-foreground py-1">使用履歴なし</div>
                                    ) : (
                                      <div className="space-y-1">
                                        {(usages[coupon.id] || []).map((usage) => (
                                          <div key={usage.id} className="flex items-center justify-between text-xs bg-background rounded px-3 py-2 border">
                                            <div className="flex items-center gap-3 min-w-0">
                                              <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(usage.used_at)}</span>
                                              <span className="truncate">{usage.reservation_title || '予約なし'}</span>
                                              <span className="font-medium text-red-500 whitespace-nowrap">-¥{usage.discount_amount.toLocaleString()}</span>
                                            </div>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-6 px-2 text-xs ml-2 flex-shrink-0"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setRestoreTarget({
                                                  usageId: usage.id,
                                                  couponId: coupon.id,
                                                  title: usage.reservation_title
                                                })
                                              }}
                                            >
                                              <RotateCcw className="h-3 w-3 mr-1" />
                                              復元
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>クーポン使用を取り消しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget?.title
                ? `「${restoreTarget.title}」で使用されたクーポンを復元します。`
                : 'このクーポン使用を取り消して、残数を1回分復元します。'}
              この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              復元する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
