import type { Column } from '@/components/patterns/table'

export interface ScenarioPerformance {
  id: string
  title: string
  events: number
}

/**
 * シナリオ分析テーブルの列定義
 */
export function createScenarioAnalysisColumns(data: ScenarioPerformance[]): Column<ScenarioPerformance>[] {
  return [
    {
      key: 'rank',
      header: '順位',
      width: 'w-20',
      sortable: false,
      align: 'center',
      render: (scenario) => {
        const index = data.findIndex(s => s.id === scenario.id)
        return (
          <div className="w-8 h-8 mx-auto rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
            {index + 1}
          </div>
        )
      }
    },
    {
      key: 'title',
      header: 'シナリオ名',
      sortable: true,
      render: (scenario) => (
        <div className="font-medium">{scenario.title}</div>
      )
    },
    {
      key: 'events',
      header: '公演数',
      width: 'w-32',
      sortable: true,
      align: 'right',
      render: (scenario) => (
        <div className="text-right">
          <div className="text-2xl font-bold">{scenario.events}</div>
          <div className="text-sm text-muted-foreground">公演</div>
        </div>
      )
    }
  ]
}

