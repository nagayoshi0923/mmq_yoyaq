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
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
}

/**
 * シナリオパフォーマンスセクション
 */
export const ScenarioPerformance: React.FC<ScenarioPerformanceProps> = ({
  stores,
  selectedStoreIds,
  onStoreIdsChange
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
      loadScenarioData(period, selectedStoreIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length, selectedStoreIds])

  // 期間変更ハンドラー
  const handlePeriodChange = (newPeriod: string) => {
    loadScenarioData(newPeriod, selectedStoreIds)
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
        selectedStoreIds={selectedStoreIds}
        onStoreIdsChange={onStoreIdsChange}
        dateRange={dateRange}
      />

      {loading ? (
        <Card className="shadow-none border">
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
