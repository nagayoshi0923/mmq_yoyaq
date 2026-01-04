import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { BarChart3 } from 'lucide-react'

interface Store {
  id: string
  name: string
  short_name: string
  region?: string
}

interface ScenarioPerformanceHeaderProps {
  period: string
  onPeriodChange: (period: string) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: Store[]
  dateRange: { startDate: string; endDate: string }
}

/**
 * シナリオパフォーマンスヘッダー
 */
export const ScenarioPerformanceHeader: React.FC<ScenarioPerformanceHeaderProps> = ({
  period,
  onPeriodChange,
  selectedStoreIds,
  onStoreIdsChange,
  stores,
  dateRange
}) => {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">シナリオ分析</span>
          </div>
        }
        description="シナリオ別の公演実績と収益分析"
      >
        <Select value={period} onValueChange={onPeriodChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="thisMonth">今月</SelectItem>
            <SelectItem value="lastMonth">先月</SelectItem>
            <SelectItem value="thisWeek">今週</SelectItem>
            <SelectItem value="lastWeek">先週</SelectItem>
            <SelectItem value="past7days">過去7日間</SelectItem>
            <SelectItem value="past30days">過去30日間</SelectItem>
            <SelectItem value="past90days">過去90日間</SelectItem>
            <SelectItem value="past180days">過去180日間</SelectItem>
            <SelectItem value="thisYear">今年</SelectItem>
            <SelectItem value="lastYear">昨年</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {/* 期間表示 */}
      <div className="text-xs text-muted-foreground">
        期間: {dateRange.startDate} ～ {dateRange.endDate}
      </div>

      {/* 店舗選択 */}
      <div className="w-64">
        <StoreMultiSelect
          stores={stores}
          selectedStoreIds={selectedStoreIds}
          onStoreIdsChange={onStoreIdsChange}
          label="店舗選択"
          placeholder="全店舗"
        />
      </div>
    </div>
  )
}
