import React from 'react'
import { ScenarioPerformanceHeader } from './ScenarioPerformanceHeader'

interface Store {
  id: string
  name: string
}

interface ScenarioPerformanceProps {
  period: string
  onPeriodChange: (period: string) => void
  selectedStore: string
  onStoreChange: (storeId: string) => void
  stores: Store[]
  dateRange: { startDate: string; endDate: string }
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void
  scenarioData: any[]
  allScenarios: any[]
  loading: boolean
}

export const ScenarioPerformance: React.FC<ScenarioPerformanceProps> = ({
  period,
  onPeriodChange,
  selectedStore,
  onStoreChange,
  stores,
  dateRange,
  onDateRangeChange,
  scenarioData,
  allScenarios,
  loading
}) => {
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">シナリオ分析</h1>
        <div className="text-center py-8">読み込み中...</div>
      </div>
    )
  }

  const totalEvents = scenarioData.reduce((sum, scenario) => sum + scenario.events, 0)
  const totalScenarios = scenarioData.length
  const averageEventsPerScenario = totalScenarios > 0 ? Math.round(totalEvents / totalScenarios * 10) / 10 : 0

  return (
    <div className="space-y-6">
      <ScenarioPerformanceHeader
        period={period}
        onPeriodChange={onPeriodChange}
        selectedStore={selectedStore}
        onStoreChange={onStoreChange}
        stores={stores}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
      />

      {/* TODO: 統計カード、テーブルなどのコンポーネントを追加 */}
      <div className="text-muted-foreground">
        <p>総公演数: {totalEvents}</p>
        <p>シナリオ数: {totalScenarios}</p>
        <p>平均公演数: {averageEventsPerScenario}</p>
      </div>

      {/* 
        Note: このセクションは非常に複雑な計算ロジックを含むため、
        段階的にコンポーネント化する必要があります。
        現在は基本構造のみを実装しています。
      */}
    </div>
  )
}

