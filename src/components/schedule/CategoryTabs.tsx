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
    <div className="bg-card border rounded-lg p-2 sm:p-3 md:p-4">
      <h3 className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm sm:text-base">
        <span>公演カテゴリ</span>
        <span className="text-xs sm:text-sm text-muted-foreground">
          （中止: {categoryCounts.cancelled}件 / 警告: {categoryCounts.alerts}件）
        </span>
      </h3>
      <Tabs value={selectedCategory} onValueChange={onCategoryChange} className="mt-2 sm:mt-3 md:mt-4">
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <TabsList className="grid grid-cols-6 w-max min-w-full sm:w-fit gap-0.5 sm:gap-1">
            <TabsTrigger value="all" className="text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 md:px-3 py-1 sm:py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              <span className="hidden sm:inline">すべて</span>
              <span className="sm:hidden">全</span>
              ({categoryCounts.all})
            </TabsTrigger>
            <TabsTrigger value="open" className="text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 md:px-3 py-1 sm:py-1.5 bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 whitespace-nowrap">
              <span className="hidden md:inline">オープン公演</span>
              <span className="md:hidden sm:inline">オープン</span>
              <span className="sm:hidden">オ</span>
              ({categoryCounts.open})
            </TabsTrigger>
            <TabsTrigger value="private" className="text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 md:px-3 py-1 sm:py-1.5 bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900 whitespace-nowrap">
              <span className="hidden md:inline">貸切公演</span>
              <span className="md:hidden sm:inline">貸切</span>
              <span className="sm:hidden">貸</span>
              ({categoryCounts.private})
            </TabsTrigger>
            <TabsTrigger value="gmtest" className="text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 md:px-3 py-1 sm:py-1.5 bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900 whitespace-nowrap">
              <span className="hidden sm:inline">GMテスト</span>
              <span className="sm:hidden">GM</span>
              ({categoryCounts.gmtest})
            </TabsTrigger>
            <TabsTrigger value="testplay" className="text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 md:px-3 py-1 sm:py-1.5 bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900 whitespace-nowrap">
              <span className="hidden sm:inline">テストプレイ</span>
              <span className="sm:hidden">テ</span>
              ({categoryCounts.testplay})
            </TabsTrigger>
            <TabsTrigger value="trip" className="text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 md:px-3 py-1 sm:py-1.5 bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900 whitespace-nowrap">
              <span className="hidden md:inline">出張公演</span>
              <span className="md:hidden sm:inline">出張</span>
              <span className="sm:hidden">出</span>
              ({categoryCounts.trip})
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  )
})

