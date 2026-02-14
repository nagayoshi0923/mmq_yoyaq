import { memo, useState } from 'react'
import { ChevronDown, BookOpen, AlertTriangle, Info } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'

interface ScenarioAboutProps {
  scenario: ScenarioDetail
}

export const ScenarioAbout = memo(function ScenarioAbout({ scenario }: ScenarioAboutProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const synopsisLength = scenario.synopsis?.length || 0
  const shouldTruncate = synopsisLength > 200

  return (
    <div className="space-y-4">
      {/* あらすじセクション - メインのアピールポイント */}
      {scenario.synopsis && (
        <div className="bg-gradient-to-b from-gray-50 to-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-sm tracking-wide">あらすじ</h3>
          </div>
          <div className="p-4 sm:p-5">
            <div className={`relative ${!isExpanded && shouldTruncate ? 'max-h-40 overflow-hidden' : ''}`}>
              <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-700 font-medium">
                {scenario.synopsis}
              </p>
              {!isExpanded && shouldTruncate && (
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/90 to-transparent" />
              )}
            </div>
            {shouldTruncate && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-700 transition-colors"
              >
                {isExpanded ? '閉じる' : '続きを読む'}
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 説明（descriptionが別にある場合） */}
      {scenario.description && scenario.description !== scenario.synopsis && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-200 bg-gray-50">
            <Info className="w-3.5 h-3.5 text-gray-500" />
            <h3 className="font-semibold text-gray-700 text-sm">公演について</h3>
          </div>
          <div className="p-4 sm:p-5">
            <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-600">
              {scenario.description}
            </p>
          </div>
        </div>
      )}

      {/* 注意事項セクション */}
      {scenario.caution && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-amber-200 bg-amber-50">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <h3 className="font-semibold text-amber-900 text-sm">シナリオ特記事項</h3>
          </div>
          <div className="p-4 sm:p-5">
            <p className="leading-relaxed whitespace-pre-wrap text-sm text-amber-800">
              {scenario.caution}
            </p>
          </div>
        </div>
      )}
    </div>
  )
})
