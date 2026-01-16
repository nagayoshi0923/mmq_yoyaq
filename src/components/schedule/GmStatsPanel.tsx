// GM出勤統計パネル - CategoryTabsと同様のスタイル

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import type { GmStatsData, GmStatsItem } from '@/pages/ScheduleManager/hooks/useGmStats'

interface GmStatsPanelProps {
  data: GmStatsData
  compact?: boolean
  selectedStaffIds?: string[]
  onStaffClick?: (staffId: string) => void
}

// 統計カテゴリの定義
const statCategories = [
  { key: 'working', label: '出勤', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { key: 'cancelled', label: '中止', color: 'text-gray-500', bgColor: 'bg-gray-100' },
  { key: 'participant', label: '参加', color: 'text-green-700', bgColor: 'bg-green-100' },
  { key: 'observer', label: '見学', color: 'text-orange-700', bgColor: 'bg-orange-100' },
] as const

export const GmStatsPanel = memo(function GmStatsPanel({
  data,
  compact = false,
  selectedStaffIds = [],
  onStaffClick
}: GmStatsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // 統計があるGMのみ表示
  const displayedGms = data.byGm.slice(0, isExpanded ? undefined : 10)
  const hasMoreGms = data.byGm.length > 10
  
  if (data.byGm.length === 0) {
    return null
  }
  
  if (compact) {
    // コンパクトモード：クリックで展開可能
    return (
      <div className="space-y-1">
        {/* ヘッダー行（クリックで展開） */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-1 overflow-x-auto scrollbar-hide hover:bg-muted/50 rounded transition-colors"
        >
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            GM:
          </span>
          <div className="flex gap-0.5 shrink-0">
            {statCategories.map(cat => (
              <span
                key={cat.key}
                className={cn(
                  "inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium whitespace-nowrap",
                  cat.bgColor, cat.color
                )}
              >
                {cat.label}
                <span className="opacity-70">{data.totals[cat.key]}</span>
              </span>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0 flex items-center gap-0.5">
            {data.byGm.length}名
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </button>
        
        {/* 展開時：スタッフ別出勤回数リスト（クリックでフィルター） */}
        {isExpanded && (
          <div className="bg-muted/30 rounded px-1 py-0.5 max-h-[120px] overflow-y-auto">
            <div className="flex flex-wrap gap-0.5">
              {data.byGm.map(gm => {
                const isSelected = selectedStaffIds.includes(gm.staffId)
                return (
                  <button
                    key={gm.staffId}
                    onClick={() => onStaffClick?.(gm.staffId)}
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground ring-1 ring-primary"
                        : "bg-background hover:bg-muted border border-border"
                    )}
                  >
                    <span className="truncate max-w-[60px]">{gm.staffName}</span>
                    <span className={cn(
                      "px-0.5 rounded text-[9px]",
                      isSelected ? "bg-primary-foreground/20" : "bg-blue-100 text-blue-700"
                    )}>
                      {gm.working}
                    </span>
                    {gm.cancelled > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-gray-100 text-gray-500 line-through">
                        {gm.cancelled}
                      </span>
                    )}
                    {gm.participant > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-green-100 text-green-700">
                        {gm.participant}
                      </span>
                    )}
                    {gm.observer > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-orange-100 text-orange-700">
                        {gm.observer}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {selectedStaffIds.length > 0 && (
              <div className="mt-0.5 text-[9px] text-muted-foreground text-center">
                クリックで解除 / 複数選択可
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          GM出勤統計
        </h3>
        <div className="flex items-center gap-3 text-sm">
          {statCategories.map(cat => (
            <span key={cat.key} className={cn("font-medium", cat.color)}>
              {cat.label}: {data.totals[cat.key]}
            </span>
          ))}
        </div>
      </div>
      
      {/* GMリスト */}
      <div className="space-y-1">
        {displayedGms.map(gm => (
          <GmStatRow key={gm.staffId} gm={gm} />
        ))}
      </div>
      
      {/* もっと表示ボタン */}
      {hasMoreGms && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              折りたたむ
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              残り{data.byGm.length - 10}名を表示
            </>
          )}
        </button>
      )}
    </div>
  )
})

// GM行コンポーネント
const GmStatRow = memo(function GmStatRow({ gm }: { gm: GmStatsItem }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 transition-colors">
      {/* GM名 */}
      <span className="font-medium text-sm min-w-[80px] truncate">
        {gm.staffName}
      </span>
      
      {/* 統計バッジ */}
      <div className="flex items-center gap-1 flex-1">
        {gm.working > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
            出勤 {gm.working}
          </span>
        )}
        {gm.cancelled > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 line-through">
            中止 {gm.cancelled}
          </span>
        )}
        {gm.participant > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
            参加 {gm.participant}
          </span>
        )}
        {gm.observer > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
            見学 {gm.observer}
          </span>
        )}
      </div>
      
      {/* 合計 */}
      <span className="text-xs text-muted-foreground">
        計 {gm.total}
      </span>
    </div>
  )
})

