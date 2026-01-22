import React, { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { devDb } from '@/components/ui/DevField'
import type { Scenario } from '@/types'

interface ScenarioStatsProps {
  scenarios: Scenario[]
  scenarioStats?: Record<string, { performanceCount: number; cancelledCount: number; totalRevenue: number }>
}

/**
 * シナリオ統計カードコンポーネント
 */
export const ScenarioStats: React.FC<ScenarioStatsProps> = ({ scenarios, scenarioStats = {} }) => {
  const stats = useMemo(() => {
    const totalScenarios = scenarios.length
    const availableScenarios = scenarios.filter(s => s.status === 'available').length
    
    // 平均公演回数を計算
    const totalPerformanceCount = scenarios.reduce((sum, s) => {
      const performanceCount = scenarioStats[s.id]?.performanceCount || 0
      return sum + performanceCount
    }, 0)
    const avgPerformanceCount = totalScenarios > 0 
      ? Math.round((totalPerformanceCount / totalScenarios) * 10) / 10 // 小数点第1位まで
      : 0
    
    const totalPlayers = scenarios.reduce((sum, s) => {
      const maxPlayers = s.player_count_max || s.player_count_min
      return sum + maxPlayers
    }, 0)
    const avgPlayers = totalScenarios > 0 ? Math.round(totalPlayers / totalScenarios) : 0

    return {
      totalScenarios,
      availableScenarios,
      avgPerformanceCount,
      avgPlayers
    }
  }, [scenarios, scenarioStats])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">総シナリオ数</div>
          <div className="text-xl sm:text-2xl font-bold" {...devDb('scenarios.count()')}>
            {stats.totalScenarios}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">利用可能</div>
          <div className="text-xl sm:text-2xl font-bold text-green-700" {...devDb('scenarios.filter(status=available).count()')}>
            {stats.availableScenarios}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">平均公演回数</div>
          <div className="text-xl sm:text-2xl font-bold" {...devDb('scenarios.avg(performance_count)')}>
            {stats.avgPerformanceCount.toFixed(1)}回
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">平均プレイヤー数</div>
          <div className="text-xl sm:text-2xl font-bold" {...devDb('scenarios.avg(player_count_max)')}>
            {stats.avgPlayers}名
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
