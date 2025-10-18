import React from 'react'
import { SalesData } from '@/types'
import { SummaryCards } from './SummaryCards'
import { RankingCards } from './RankingCards'
import { SalesChart } from './SalesChart'
import { ExportButtons } from './ExportButtons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

interface Store {
  id: string
  name: string
  short_name: string
}

interface SalesOverviewProps {
  salesData: SalesData | null
  loading: boolean
  stores: Store[]
  selectedPeriod: string
  selectedStore: string
  dateRange: { startDate: string; endDate: string }
  onPeriodChange: (period: string) => void
  onStoreChange: (store: string) => void
}

/**
 * 売上概要セクション
 */
export const SalesOverview: React.FC<SalesOverviewProps> = ({
  salesData,
  loading,
  stores,
  selectedPeriod,
  selectedStore,
  dateRange,
  onPeriodChange,
  onStoreChange
}) => {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">売上管理</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">読み込み中...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">売上管理</h1>
        <ExportButtons salesData={salesData} />
      </div>

      {/* フィルター */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Label>期間</Label>
          <Select value={selectedPeriod} onValueChange={onPeriodChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">今月</SelectItem>
              <SelectItem value="lastMonth">先月</SelectItem>
              <SelectItem value="thisWeek">今週</SelectItem>
              <SelectItem value="lastWeek">先週</SelectItem>
              <SelectItem value="last7days">直近7日</SelectItem>
              <SelectItem value="last30days">直近30日</SelectItem>
              <SelectItem value="thisYear">今年</SelectItem>
              <SelectItem value="lastYear">去年</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Label>店舗</Label>
          <Select value={selectedStore} onValueChange={onStoreChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全店舗</SelectItem>
              {stores.map(store => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* サマリーカード */}
      <SummaryCards 
        salesData={salesData}
        dateRange={dateRange}
      />

      {/* ランキングカード */}
      <RankingCards salesData={salesData} />

      {/* チャート */}
      <SalesChart 
        salesData={salesData}
        dateRange={dateRange}
      />
    </div>
  )
}
