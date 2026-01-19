// カテゴリフィルター + GM統計の統合コンポーネント

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import type { GmStatsData, GmStatsItem } from '@/pages/ScheduleManager/hooks/useGmStats'

interface CategoryGmStatsBarProps {
  // カテゴリフィルター
  selectedCategory: string
  categoryCounts: Record<string, number>
  onCategoryChange: (category: string) => void
  // GM統計
  gmStats: GmStatsData
  selectedStaffIds?: string[]
  onStaffClick?: (staffId: string) => void
}

// カテゴリ定義（公演カテゴリ + 役割）
const categories = [
  { id: 'all', label: '全て', color: 'text-slate-700', bgColor: 'bg-slate-100' },
  { id: 'open', label: 'オープン', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { id: 'private', label: '貸切', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { id: 'gmtest', label: 'GMテスト', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  { id: 'testplay', label: 'テスト', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  { id: 'trip', label: '出張', color: 'text-green-700', bgColor: 'bg-green-100' },
  { id: 'mtg', label: 'MTG', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
] as const

// カテゴリIDとGM統計キーのマッピング
const categoryToGmStatKey: Record<string, keyof GmStatsData['totals']> = {
  open: 'openWorking',
  private: 'privateWorking',
  gmtest: 'gmtestWorking',
}

// 役割統計の定義（編集ダイアログと色を統一）
const roleStats = [
  { key: 'participant', label: '参加', color: 'text-green-700', bgColor: 'bg-green-100' },
  { key: 'observer', label: '見学', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { key: 'cancelled', label: '中止', color: 'text-gray-500', bgColor: 'bg-gray-100', strikethrough: true },
] as const

export const CategoryGmStatsBar = memo(function CategoryGmStatsBar({
  selectedCategory,
  categoryCounts,
  onCategoryChange,
  gmStats,
  selectedStaffIds = [],
  onStaffClick
}: CategoryGmStatsBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (gmStats.byGm.length === 0 && Object.values(categoryCounts).every(v => v === 0)) {
    return null
  }
  
  return (
    <div className="space-y-0.5">
      {/* メイン行：カテゴリ + GM統計 */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {/* カテゴリバッジ（クリックでフィルター） */}
        <div className="flex gap-0.5 shrink-0">
          {categories.map(cat => {
            const eventCount = categoryCounts[cat.id] || 0
            const gmStatKey = categoryToGmStatKey[cat.id]
            const gmCount = gmStatKey ? gmStats.totals[gmStatKey] : undefined
            
            // 全てカテゴリ以外で公演数0ならスキップ
            if (cat.id !== 'all' && eventCount === 0) return null
            
            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={cn(
                  "inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium transition-all whitespace-nowrap",
                  cat.bgColor, cat.color,
                  selectedCategory === cat.id 
                    ? "ring-1 ring-primary ring-offset-0" 
                    : "opacity-70 hover:opacity-100"
                )}
              >
                {cat.label}
                <span className="opacity-60">{eventCount}</span>
                {gmCount !== undefined && gmCount > 0 && (
                  <span className="opacity-80 font-bold">/{gmCount}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* セパレータ */}
        <span className="text-muted-foreground/30 shrink-0">|</span>

        {/* その他出勤 */}
        {gmStats.totals.otherWorking > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium whitespace-nowrap bg-slate-100 text-slate-700">
            その他
            <span className="opacity-70">{gmStats.totals.otherWorking}</span>
          </span>
        )}

        {/* 役割統計（参加・見学・中止） */}
        {roleStats.map(stat => {
          const value = gmStats.totals[stat.key as keyof typeof gmStats.totals]
          if (value === 0) return null
          return (
            <span
              key={stat.key}
              className={cn(
                "inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium whitespace-nowrap",
                stat.bgColor, stat.color,
                'strikethrough' in stat && stat.strikethrough && "line-through"
              )}
            >
              {stat.label}
              <span className="opacity-70">{value}</span>
            </span>
          )
        })}

        {/* 警告・GM数 */}
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0 flex items-center gap-1">
          {categoryCounts.alerts > 0 && (
            <span className="text-red-500">警告:{categoryCounts.alerts}</span>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-0.5 hover:text-foreground transition-colors"
          >
            <Users className="h-3 w-3" />
            {gmStats.byGm.length}名
            <span className="sm:hidden">
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </button>
        </span>
      </div>
      
      {/* 展開時：スタッフ別出勤回数リスト - PCは常時表示 */}
      <div className={cn("sm:block", isExpanded ? "block" : "hidden")}>
        <div className="bg-muted/30 rounded px-1 py-0.5 max-h-[120px] overflow-y-auto">
          <div className="flex flex-wrap gap-0.5">
            {gmStats.byGm.map(gm => (
              <GmBadge
                key={gm.staffId}
                gm={gm}
                isSelected={selectedStaffIds.includes(gm.staffId)}
                onClick={() => onStaffClick?.(gm.staffId)}
              />
            ))}
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
})

// GMバッジコンポーネント
const GmBadge = memo(function GmBadge({
  gm,
  isSelected,
  onClick
}: {
  gm: GmStatsItem
  isSelected: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
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
      {/* 役割別（編集ダイアログと色を統一） */}
      {gm.participant > 0 && (
        <span className="px-0.5 rounded text-[9px] bg-green-100 text-green-700">
          {gm.participant}
        </span>
      )}
      {gm.observer > 0 && (
        <span className="px-0.5 rounded text-[9px] bg-purple-100 text-purple-700">
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
})

