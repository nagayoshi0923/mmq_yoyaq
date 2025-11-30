import React, { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { Scenario } from '@/types'

interface ScenarioStatsProps {
  scenarios: Scenario[]
}

/**
 * シナリオ統計カードコンポーネント
 */
export const ScenarioStats: React.FC<ScenarioStatsProps> = ({ scenarios }) => {
  const stats = useMemo(() => {
    const totalScenarios = scenarios.length
    const availableScenarios = scenarios.filter(s => s.status === 'available').length
    const totalLicenseAmount = scenarios.reduce((sum, s) => sum + (s.license_amount || 0), 0)
    const totalPlayers = scenarios.reduce((sum, s) => {
      const maxPlayers = s.player_count_max || s.player_count_min
      return sum + maxPlayers
    }, 0)
    const avgPlayers = totalScenarios > 0 ? Math.round(totalPlayers / totalScenarios) : 0

    return {
      totalScenarios,
      availableScenarios,
      totalLicenseAmount,
      avgPlayers
    }
  }, [scenarios])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">総シナリオ数</div>
          <div className="text-xl sm:text-2xl font-bold">{stats.totalScenarios}</div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">利用可能</div>
          <div className="text-xl sm:text-2xl font-bold text-green-700">{stats.availableScenarios}</div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">総ライセンス料</div>
          <div className="text-xl sm:text-2xl font-bold">¥{stats.totalLicenseAmount.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">平均プレイヤー数</div>
          <div className="text-xl sm:text-2xl font-bold">{stats.avgPlayers}名</div>
        </CardContent>
      </Card>
    </div>
  )
}
