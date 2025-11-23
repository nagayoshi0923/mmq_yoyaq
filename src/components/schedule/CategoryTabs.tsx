// スケジュールカテゴリのタブ

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'

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
]

export const CategoryTabs = memo(function CategoryTabs({
  selectedCategory,
  categoryCounts,
  onCategoryChange
}: CategoryTabsProps) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm">公演カテゴリ</h3>
        <div className="text-xs text-muted-foreground">
          中止: {categoryCounts.cancelled} / 警告: {categoryCounts.alerts}
        </div>
      </div>
      
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={`
              relative flex flex-col items-center gap-0.5 p-2 rounded-md border transition-all text-xs
              ${category.color}
              ${selectedCategory === category.id 
                ? 'ring-2 ring-primary shadow-sm' 
                : 'hover:shadow-sm'
              }
            `}
          >
            <span className="font-medium truncate w-full text-center">{category.label}</span>
            <span className="text-xs opacity-75">
              {categoryCounts[category.id] || 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})

