import React, { useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScenarioPerformanceHeader } from './ScenarioPerformanceHeader'
import { ScenarioAnalysisSummary } from './ScenarioAnalysisSummary'
import { ScenarioAnalysisTable } from './ScenarioAnalysisTable'
import { useScenarioAnalysis } from '../hooks/useScenarioAnalysis'

interface Store {
  id: string
  name: string
  short_name: string
}

interface ScenarioPerformanceProps {
  stores: Store[]
  selectedStore: string
  onStoreChange: (store: string) => void
}

/**
 * シナリオパフォーマンスセクション
 */
export const ScenarioPerformance: React.FC<ScenarioPerformanceProps> = ({
  stores,
  selectedStore,
  onStoreChange
}) => {
  const {
    scenarioData,
    loading,
    period,
    dateRange,
    loadScenarioData
  } = useScenarioAnalysis()

  // 初回読み込みと店舗変更時にデータを取得
  useEffect(() => {
    if (stores.length > 0) {
      loadScenarioData(period, selectedStore)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length, selectedStore])

  // 期間変更ハンドラー
  const handlePeriodChange = (newPeriod: string) => {
    loadScenarioData(newPeriod, selectedStore)
  }

  // サマリー統計を計算
  const summary = useMemo(() => {
    const totalScenarios = scenarioData.length
    const totalEvents = scenarioData.reduce((sum, scenario) => sum + scenario.events, 0)
    const averageEventsPerScenario = totalScenarios > 0 ? totalEvents / totalScenarios : 0

    return {
      totalScenarios,
      totalEvents,
      averageEventsPerScenario
    }
  }, [scenarioData])

  return (
    <div className="space-y-6">
      <ScenarioPerformanceHeader
        period={period}
        onPeriodChange={handlePeriodChange}
        stores={stores}
        selectedStore={selectedStore}
        onStoreChange={onStoreChange}
        dateRange={dateRange}
      />

      {loading ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">
              データを読み込んでいます...
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <ScenarioAnalysisSummary
            totalScenarios={summary.totalScenarios}
            totalEvents={summary.totalEvents}
            averageEventsPerScenario={summary.averageEventsPerScenario}
          />

          <ScenarioAnalysisTable scenarioData={scenarioData} />
        </>
      )}
    </div>
  )
}
