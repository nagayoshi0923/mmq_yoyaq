// スケジュールカテゴリのタブ

import { memo } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface CategoryTabsProps {
  selectedCategory: string
  categoryCounts: Record<string, number>
  onCategoryChange: (category: string) => void
}

export const CategoryTabs = memo(function CategoryTabs({
  selectedCategory,
  categoryCounts,
  onCategoryChange
}: CategoryTabsProps) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="flex items-center gap-2">
        公演カテゴリ
        <span className="text-sm text-muted-foreground">
          （中止: {categoryCounts.cancelled}件 / 警告: {categoryCounts.alerts}件）
        </span>
      </h3>
      <Tabs value={selectedCategory} onValueChange={onCategoryChange} className="mt-4">
        <TabsList className="grid grid-cols-6 w-fit gap-1">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            すべて ({categoryCounts.all})
          </TabsTrigger>
          <TabsTrigger value="open" className="bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900">
            オープン公演 ({categoryCounts.open})
          </TabsTrigger>
          <TabsTrigger value="private" className="bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900">
            貸切公演 ({categoryCounts.private})
          </TabsTrigger>
          <TabsTrigger value="gmtest" className="bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900">
            GMテスト ({categoryCounts.gmtest})
          </TabsTrigger>
          <TabsTrigger value="testplay" className="bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900">
            テストプレイ ({categoryCounts.testplay})
          </TabsTrigger>
          <TabsTrigger value="trip" className="bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900">
            出張公演 ({categoryCounts.trip})
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
})

