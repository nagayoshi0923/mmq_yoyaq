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
    <div className="bg-card border rounded-lg p-2 md:p-3 xl:p-4">
      <h3 className="flex flex-wrap items-center gap-1 md:gap-1.5 xl:gap-2 text-[11px] md:text-xs leading-tight">
        <span className="font-medium">公演カテゴリ</span>
        <span className="text-[10px] md:text-xs text-muted-foreground whitespace-nowrap">
          （中止: {categoryCounts.cancelled}件 / 警告: {categoryCounts.alerts}件）
        </span>
      </h3>
      <Tabs value={selectedCategory} onValueChange={onCategoryChange} className="mt-2 md:mt-3">
        <div className="overflow-x-auto -mx-2 md:mx-0">
          <TabsList className="grid grid-cols-6 w-max min-w-full md:w-fit gap-1">
            <TabsTrigger value="all" className="text-[11px] md:text-xs px-1.5 md:px-2 xl:px-3 py-1 md:py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap h-8 md:h-9">
              <span className="hidden md:inline">すべて</span>
              <span className="md:hidden">全</span>
              <span className="ml-0.5">({categoryCounts.all})</span>
            </TabsTrigger>
            <TabsTrigger value="open" className="text-[11px] md:text-xs px-1.5 md:px-2 xl:px-3 py-1 md:py-1.5 bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 whitespace-nowrap h-8 md:h-9">
              <span className="hidden xl:inline">オープン公演</span>
              <span className="xl:hidden md:inline hidden">オープン</span>
              <span className="md:hidden">オ</span>
              <span className="ml-0.5">({categoryCounts.open})</span>
            </TabsTrigger>
            <TabsTrigger value="private" className="text-[11px] md:text-xs px-1.5 md:px-2 xl:px-3 py-1 md:py-1.5 bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900 whitespace-nowrap h-8 md:h-9">
              <span className="hidden xl:inline">貸切公演</span>
              <span className="xl:hidden md:inline hidden">貸切</span>
              <span className="md:hidden">貸</span>
              <span className="ml-0.5">({categoryCounts.private})</span>
            </TabsTrigger>
            <TabsTrigger value="gmtest" className="text-[11px] md:text-xs px-1.5 md:px-2 xl:px-3 py-1 md:py-1.5 bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900 whitespace-nowrap h-8 md:h-9">
              <span className="hidden md:inline">GMテスト</span>
              <span className="md:hidden">GM</span>
              <span className="ml-0.5">({categoryCounts.gmtest})</span>
            </TabsTrigger>
            <TabsTrigger value="testplay" className="text-[11px] md:text-xs px-1.5 md:px-2 xl:px-3 py-1 md:py-1.5 bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900 whitespace-nowrap h-8 md:h-9">
              <span className="hidden md:inline">テストプレイ</span>
              <span className="md:hidden">テ</span>
              <span className="ml-0.5">({categoryCounts.testplay})</span>
            </TabsTrigger>
            <TabsTrigger value="trip" className="text-[11px] md:text-xs px-1.5 md:px-2 xl:px-3 py-1 md:py-1.5 bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900 whitespace-nowrap h-8 md:h-9">
              <span className="hidden xl:inline">出張公演</span>
              <span className="xl:hidden md:inline hidden">出張</span>
              <span className="md:hidden">出</span>
              <span className="ml-0.5">({categoryCounts.trip})</span>
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  )
})

