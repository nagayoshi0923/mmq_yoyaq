import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Loader2, Gift, Users, CheckCircle, Ticket } from 'lucide-react'
import { getCampaignStats, getCampaignCoupons, type CampaignStats as StatsType } from '@/lib/api/couponApi'
import type { CouponCampaign, CustomerCoupon } from '@/types'

interface CampaignStatsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: CouponCampaign | null
}

type CouponWithCustomer = CustomerCoupon & { 
  customers?: { name: string; email: string } 
}

export function CampaignStats({
  open,
  onOpenChange,
  campaign
}: CampaignStatsProps) {
  const [stats, setStats] = useState<StatsType | null>(null)
  const [coupons, setCoupons] = useState<CouponWithCustomer[]>([])
  const [isLoading, setIsLoading] = useState(false)

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
    }
  }, [open, campaign, loadData])

  if (!campaign) return null

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
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
                <ScrollArea className="h-[300px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>顧客</TableHead>
                        <TableHead className="w-[80px]">残り回数</TableHead>
                        <TableHead className="w-[100px]">状態</TableHead>
                        <TableHead className="w-[100px]">有効期限</TableHead>
                        <TableHead className="w-[100px]">付与日</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coupons.map((coupon) => (
                        <TableRow key={coupon.id}>
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
                          <TableCell className="text-sm">
                            {formatDate(coupon.created_at)}
                          </TableCell>
                        </TableRow>
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
  )
}
