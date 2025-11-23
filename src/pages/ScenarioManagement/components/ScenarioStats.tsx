import React, { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Play, DollarSign, Users } from 'lucide-react'
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
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      <Card>
        <CardContent className="p-3 sm:p-4 md:pt-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-base md:text-lg">{stats.totalScenarios}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">総シナリオ数</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4 md:pt-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Play className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-base md:text-lg">{stats.availableScenarios}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">利用可能</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4 md:pt-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-base md:text-lg">¥{stats.totalLicenseAmount.toLocaleString()}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">総ライセンス料</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4 md:pt-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-base md:text-lg">{stats.avgPlayers}名</p>
              <p className="text-xs sm:text-sm text-muted-foreground">平均プレイヤー数</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

