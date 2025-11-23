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
    <div className="bg-card border rounded-lg p-2 xs:p-2.5 sm:p-3 md:p-4">
      <h3 className="flex flex-wrap items-center gap-2">
        <span>公演カテゴリ</span>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          （中止: {categoryCounts.cancelled}件 / 警告: {categoryCounts.alerts}件）
        </span>
      </h3>
      <Tabs value={selectedCategory} onValueChange={onCategoryChange} className="mt-3">
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <TabsList className="grid grid-cols-6 w-max min-w-full sm:w-fit gap-1">
            <TabsTrigger value="all" className="px-2 md:px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              全({categoryCounts.all})
            </TabsTrigger>
            <TabsTrigger value="open" className="px-2 md:px-3 py-1.5 bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 whitespace-nowrap">
              オープン({categoryCounts.open})
            </TabsTrigger>
            <TabsTrigger value="private" className="px-2 md:px-3 py-1.5 bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900 whitespace-nowrap">
              貸切({categoryCounts.private})
            </TabsTrigger>
            <TabsTrigger value="gmtest" className="px-2 md:px-3 py-1.5 bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900 whitespace-nowrap">
              GMテスト({categoryCounts.gmtest})
            </TabsTrigger>
            <TabsTrigger value="testplay" className="px-2 md:px-3 py-1.5 bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900 whitespace-nowrap">
              テスト({categoryCounts.testplay})
            </TabsTrigger>
            <TabsTrigger value="trip" className="px-2 md:px-3 py-1.5 bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900 whitespace-nowrap">
              出張({categoryCounts.trip})
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  )
})

