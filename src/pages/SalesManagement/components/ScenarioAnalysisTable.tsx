import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ScenarioPerformance {
  id: string
  title: string
  events: number
}

interface ScenarioAnalysisTableProps {
  scenarioData: ScenarioPerformance[]
}

export const ScenarioAnalysisTable: React.FC<ScenarioAnalysisTableProps> = ({
  scenarioData
}) => {
  // 公演数でソート
  const sortedData = [...scenarioData].sort((a, b) => b.events - a.events)

  return (
    <Card>
      <CardHeader>
        <CardTitle>シナリオ別公演数</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedData.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              期間内に公演されたシナリオがありません
            </div>
          ) : (
            sortedData.map((scenario, index) => (
              <div
                key={scenario.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{scenario.title}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{scenario.events}</div>
                  <div className="text-sm text-muted-foreground">公演</div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

