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

// 統計カテゴリの定義（公演カテゴリ別 + 役割別）
// 色はCategoryTabsと統一（濃さは-700で統一）
const statCategories = [
  // 公演カテゴリ別出勤（CategoryTabs準拠）
  { key: 'openWorking', label: 'オープン', shortLabel: 'オ', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { key: 'privateWorking', label: '貸切', shortLabel: '貸', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { key: 'gmtestWorking', label: 'GMテスト', shortLabel: 'テ', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  { key: 'otherWorking', label: 'その他', shortLabel: '他', color: 'text-slate-700', bgColor: 'bg-slate-100' },
  // 役割別
  { key: 'participant', label: '参加', shortLabel: '参', color: 'text-green-700', bgColor: 'bg-green-100' },
  { key: 'observer', label: '見学', shortLabel: '見', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  { key: 'cancelled', label: '中止', shortLabel: '中', color: 'text-gray-500', bgColor: 'bg-gray-100', strikethrough: true },
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
    // コンパクトモード：PCは常時展開、モバイルは折りたたみ可能
    return (
      <div className="space-y-1">
        {/* ヘッダー行（モバイルのみクリックで展開） */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-1 overflow-x-auto scrollbar-hide sm:cursor-default cursor-pointer hover:bg-muted/50 sm:hover:bg-transparent rounded transition-colors"
        >
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            GM:
          </span>
          <div className="flex gap-0.5 shrink-0">
            {statCategories.map(cat => {
              const value = data.totals[cat.key as keyof typeof data.totals]
              if (value === 0) return null
              return (
                <span
                  key={cat.key}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium whitespace-nowrap",
                    cat.bgColor, cat.color,
                    'strikethrough' in cat && cat.strikethrough && "line-through"
                  )}
                >
                  {cat.label}
                  <span className="opacity-70">{value}</span>
                </span>
              )
            })}
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0 flex items-center gap-0.5">
            {data.byGm.length}名
            <span className="sm:hidden">
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </span>
        </div>
        
        {/* 展開時：スタッフ別出勤回数リスト（クリックでフィルター） - PCは常時表示 */}
        <div className={cn("sm:block", isExpanded ? "block" : "hidden")}>
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
                    {/* カテゴリ別出勤数 */}
                    {gm.openWorking > 0 && (
                      <span className={cn(
                        "px-0.5 rounded text-[9px]",
                        isSelected ? "bg-primary-foreground/20" : "bg-blue-100 text-blue-700"
                      )}>
                        {gm.openWorking}
                      </span>
                    )}
                    {gm.privateWorking > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-purple-100 text-purple-700">
                        {gm.privateWorking}
                      </span>
                    )}
                    {gm.gmtestWorking > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-orange-100 text-orange-700">
                        {gm.gmtestWorking}
                      </span>
                    )}
                    {gm.otherWorking > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-slate-100 text-slate-700">
                        {gm.otherWorking}
                      </span>
                    )}
                    {/* 役割別 */}
                    {gm.participant > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-green-100 text-green-700">
                        {gm.participant}
                      </span>
                    )}
                    {gm.observer > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-indigo-100 text-indigo-700">
                        {gm.observer}
                      </span>
                    )}
                    {gm.cancelled > 0 && (
                      <span className="px-0.5 rounded text-[9px] bg-gray-100 text-gray-500 line-through">
                        {gm.cancelled}
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
        </div>
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
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {statCategories.map(cat => {
            const value = data.totals[cat.key as keyof typeof data.totals]
            if (value === 0) return null
            return (
              <span 
                key={cat.key} 
                className={cn(
                  "font-medium",
                  cat.color,
                  'strikethrough' in cat && cat.strikethrough && "line-through"
                )}
              >
                {cat.label}: {value}
              </span>
            )
          })}
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
      <div className="flex items-center gap-1 flex-1 flex-wrap">
        {/* カテゴリ別出勤数 */}
        {gm.openWorking > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
            オープン {gm.openWorking}
          </span>
        )}
        {gm.privateWorking > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
            貸切 {gm.privateWorking}
          </span>
        )}
        {gm.gmtestWorking > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
            GMテスト {gm.gmtestWorking}
          </span>
        )}
        {gm.otherWorking > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
            その他 {gm.otherWorking}
          </span>
        )}
        {/* 役割別 */}
        {gm.participant > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
            参加 {gm.participant}
          </span>
        )}
        {gm.observer > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
            見学 {gm.observer}
          </span>
        )}
        {gm.cancelled > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 line-through">
            中止 {gm.cancelled}
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

