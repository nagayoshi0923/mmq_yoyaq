import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'

interface ScenarioAboutProps {
  scenario: ScenarioDetail
}

export const ScenarioAbout = memo(function ScenarioAbout({ scenario }: ScenarioAboutProps) {
  return (
    <div>
      <h3 className="font-bold mb-3">ABOUT</h3>
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* 概要（基本情報） */}
          <div className="bg-muted/50 p-3 rounded space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{scenario.player_count_min}〜{scenario.player_count_max}人</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{(scenario.duration / 60).toFixed(1)}時間</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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
              <p className="leading-relaxed whitespace-pre-wrap">{scenario.synopsis}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

