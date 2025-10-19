import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TanStackDataTable } from '@/components/patterns/table'
import { createScenarioAnalysisColumns, type ScenarioPerformance } from '../utils/tableColumns'

interface ScenarioAnalysisTableProps {
  scenarioData: ScenarioPerformance[]
}

export const ScenarioAnalysisTable: React.FC<ScenarioAnalysisTableProps> = ({
  scenarioData
}) => {
  // ソート状態
  const [sortState, setSortState] = useState<{ field: string; direction: 'asc' | 'desc' } | undefined>({ 
    field: 'events', 
    direction: 'desc' 
  })

  // ソート処理
  const sortedData = useMemo(() => {
    if (!sortState) return scenarioData

    return [...scenarioData].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortState.field) {
        case 'title':
          aValue = a.title.toLowerCase()
          bValue = b.title.toLowerCase()
          break
        case 'events':
          aValue = a.events
          bValue = b.events
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortState.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortState.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [scenarioData, sortState])

  // テーブル列定義（メモ化）
  const tableColumns = useMemo(
    () => createScenarioAnalysisColumns(sortedData),
    [sortedData]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>シナリオ別公演数</CardTitle>
      </CardHeader>
      <CardContent>
        <TanStackDataTable
          data={sortedData}
          columns={tableColumns}
          getRowKey={(scenario) => `${scenario.id}_${scenario.category || 'open'}`}
          sortState={sortState}
          onSort={setSortState}
          emptyMessage="期間内に公演されたシナリオがありません"
        />
      </CardContent>
    </Card>
  )
}

