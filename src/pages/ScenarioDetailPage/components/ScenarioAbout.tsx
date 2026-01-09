import { memo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, ChevronDown, BookOpen } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

interface ScenarioAboutProps {
  scenario: ScenarioDetail
}

export const ScenarioAbout = memo(function ScenarioAbout({ scenario }: ScenarioAboutProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const synopsisLength = scenario.synopsis?.length || 0
  const shouldTruncate = synopsisLength > 200

  return (
    <div className="space-y-4">
      {/* あらすじセクション */}
      {scenario.synopsis && (
        <div className="bg-gray-50 border border-gray-200">
          <div 
            className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
            style={{ backgroundColor: THEME.primary }}
          >
            <BookOpen className="w-4 h-4 text-white" />
            <h3 className="font-semibold text-white text-sm">あらすじ</h3>
          </div>
          <div className="p-4">
            <div className={`relative ${!isExpanded && shouldTruncate ? 'max-h-32 overflow-hidden' : ''}`}>
              <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-700">
                {scenario.synopsis}
              </p>
              {/* グラデーションオーバーレイ */}
              {!isExpanded && shouldTruncate && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50 to-transparent" />
              )}
            </div>
            {shouldTruncate && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 flex items-center gap-1 text-sm font-medium transition-colors"
                style={{ color: THEME.primary }}
              >
                {isExpanded ? '閉じる' : '続きを読む'}
                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 基本情報 */}
      <div className="bg-white border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-900 mb-3 text-sm">シナリオ情報</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <div>
              <span className="text-gray-500 text-xs">プレイ人数</span>
              <p className="font-medium text-gray-900">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div>
              <span className="text-gray-500 text-xs">プレイ時間</span>
              <p className="font-medium text-gray-900">{formatDuration(scenario.duration, 'minutes')}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
          {scenario.genre.map((g, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {g}
            </Badge>
          ))}
          {scenario.has_pre_reading && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
              事前読解あり
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
})

