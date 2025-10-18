import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, TrendingUp, BarChart3 } from 'lucide-react'

interface ScenarioAnalysisSummaryProps {
  totalScenarios: number
  totalEvents: number
  averageEventsPerScenario: number
}

export const ScenarioAnalysisSummary: React.FC<ScenarioAnalysisSummaryProps> = ({
  totalScenarios,
  totalEvents,
  averageEventsPerScenario
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総シナリオ数</CardTitle>
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalScenarios}</div>
          <p className="text-xs text-muted-foreground">
            期間内に公演されたシナリオ
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総公演数</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalEvents}</div>
          <p className="text-xs text-muted-foreground">
            期間内の全公演
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">平均公演数</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{averageEventsPerScenario.toFixed(1)}</div>
          <p className="text-xs text-muted-foreground">
            シナリオあたりの平均公演数
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

