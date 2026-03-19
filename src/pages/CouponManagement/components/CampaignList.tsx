import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  MoreVertical, 
  Edit, 
  Gift, 
  BarChart3, 
  Loader2,
  Ticket,
  Calendar,
  Users
} from 'lucide-react'
import type { CouponCampaign } from '@/types'

interface CampaignListProps {
  campaigns: CouponCampaign[]
  isLoading: boolean
  onEdit: (campaign: CouponCampaign) => void
  onToggleActive: (campaign: CouponCampaign) => void
  onGrant: (campaign: CouponCampaign) => void
  onViewStats: (campaign: CouponCampaign) => void
  toggleLoading?: string | null
}

export function CampaignList({
  campaigns,
  isLoading,
  onEdit,
  onToggleActive,
  onGrant,
  onViewStats,
  toggleLoading
}: CampaignListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12">
        <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">キャンペーンがありません</h3>
        <p className="text-muted-foreground">
          「新規キャンペーン」ボタンからキャンペーンを作成してください
        </p>
      </div>
    )
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getDiscountDisplay = (campaign: CouponCampaign) => {
    if (campaign.discount_type === 'fixed') {
      return `${campaign.discount_amount.toLocaleString()}円OFF`
    }
    return `${campaign.discount_amount}%OFF`
  }

  const getTriggerBadge = (triggerType: string) => {
    switch (triggerType) {
      case 'registration':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">新規登録時</Badge>
      case 'manual':
        return <Badge variant="outline">手動付与</Badge>
      default:
        return <Badge variant="outline">{triggerType}</Badge>
    }
  }

  const getTargetBadge = (targetType: string) => {
    switch (targetType) {
      case 'all':
        return <Badge variant="outline" className="text-xs">全予約</Badge>
      case 'specific_organization':
        return <Badge variant="outline" className="text-xs">組織限定</Badge>
      case 'specific_scenarios':
        return <Badge variant="outline" className="text-xs">シナリオ限定</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <Card key={campaign.id} className={!campaign.is_active ? 'opacity-60' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h3 className="font-semibold text-lg">{campaign.name}</h3>
                  {getTriggerBadge(campaign.trigger_type)}
                  {getTargetBadge(campaign.target_type)}
                  {!campaign.is_active && (
                    <Badge variant="secondary">無効</Badge>
                  )}
                </div>
                
                {campaign.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {campaign.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Gift className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{getDiscountDisplay(campaign)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>使用回数: {campaign.max_uses_per_customer}回</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {formatDate(campaign.valid_from)} ～ {formatDate(campaign.valid_until)}
                    </span>
                  </div>
                  {campaign.coupon_expiry_days && (
                    <div className="text-muted-foreground">
                      有効日数: {campaign.coupon_expiry_days}日
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  {toggleLoading === campaign.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Switch
                      checked={campaign.is_active}
                      onCheckedChange={() => onToggleActive(campaign)}
                      aria-label="キャンペーンの有効/無効"
                    />
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(campaign)}>
                      <Edit className="h-4 w-4 mr-2" />
                      編集
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onGrant(campaign)}
                    >
                      <Gift className="h-4 w-4 mr-2" />
                      クーポン付与
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewStats(campaign)}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      統計を見る
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
