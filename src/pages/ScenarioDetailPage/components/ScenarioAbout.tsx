import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'

interface ScenarioAboutProps {
  scenario: ScenarioDetail
}

export const ScenarioAbout = memo(function ScenarioAbout({ scenario }: ScenarioAboutProps) {
  return (
    <div>
      <h3 className="mb-2 sm:mb-3 text-sm sm:text-base">ABOUT</h3>
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          {/* 概要（基本情報） */}
          <div className="bg-muted/50 p-2 sm:p-3 rounded space-y-1.5 sm:space-y-2">
            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                <span>{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                <span>{formatDuration(scenario.duration, 'minutes')}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {scenario.genre.map((g, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {g}
                </Badge>
              ))}
              {scenario.has_pre_reading && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                  事前読解あり
                </Badge>
              )}
            </div>
          </div>

          {/* あらすじ */}
          {scenario.synopsis && (
            <div>
              <p className="leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">{scenario.synopsis}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

