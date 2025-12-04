// スケジュールカテゴリのタブ

import { memo } from 'react'
import { cn } from '@/lib/utils'

interface CategoryTabsProps {
  selectedCategory: string
  categoryCounts: Record<string, number>
  onCategoryChange: (category: string) => void
}

const categories = [
  { id: 'all', label: '全て', color: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200' },
  { id: 'open', label: 'オープン', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200' },
  { id: 'private', label: '貸切', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200' },
  { id: 'gmtest', label: 'GMテスト', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200' },
  { id: 'testplay', label: 'テスト', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200' },
  { id: 'trip', label: '出張', color: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200' },
  { id: 'mtg', label: 'MTG', color: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 border-cyan-200' },
]

export const CategoryTabs = memo(function CategoryTabs({
  selectedCategory,
  categoryCounts,
  onCategoryChange
}: CategoryTabsProps) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold">公演カテゴリ</h3>
        <div className="text-sm text-muted-foreground">
          中止: {categoryCounts.cancelled} / 警告: {categoryCounts.alerts}
        </div>
      </div>
      
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 h-16 px-1 rounded-md transition-all focus:outline-none",
              category.color,
              selectedCategory === category.id 
                ? "border-2 border-primary" 
                : "border hover:bg-muted/50"
            )}
          >
            <span className="font-bold text-sm leading-tight w-full text-center px-1 truncate">
              {category.label}
            </span>
            <span className="text-xs opacity-75 font-medium">
              {categoryCounts[category.id] || 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})

