import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface Store {
  id: string
  name: string
}

interface ScenarioPerformanceHeaderProps {
  period: string
  onPeriodChange: (period: string) => void
  selectedStore: string
  onStoreChange: (storeId: string) => void
  stores: Store[]
  dateRange: { startDate: string; endDate: string }
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void
}

export const ScenarioPerformanceHeader: React.FC<ScenarioPerformanceHeaderProps> = ({
  period,
  onPeriodChange,
  selectedStore,
  onStoreChange,
  stores,
  dateRange,
  onDateRangeChange
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">シナリオ分析</h1>
        <div className="flex items-center gap-4">
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
              <SelectItem value="custom">カスタム</SelectItem>
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Label htmlFor="scenarioStartDate">開始日</Label>
              <Input
                id="scenarioStartDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
                className="w-40"
              />
              <Label htmlFor="scenarioEndDate">終了日</Label>
              <Input
                id="scenarioEndDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
                className="w-40"
              />
            </div>
          )}
        </div>
      </div>

      {/* 期間表示 */}
      <div className="text-sm text-muted-foreground">
        期間: {dateRange.startDate} ～ {dateRange.endDate}
      </div>

      {/* 店舗選択 */}
      <div className="flex items-center gap-4">
        <Label htmlFor="scenarioStoreSelect">店舗選択</Label>
        <Select value={selectedStore} onValueChange={onStoreChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="店舗を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全店舗</SelectItem>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id.toString()}>
                {store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

