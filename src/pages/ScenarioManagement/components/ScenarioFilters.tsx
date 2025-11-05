import React from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Search, Filter } from 'lucide-react'

interface ScenarioFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
}

/**
 * シナリオ検索・フィルタコンポーネント
 */
export const ScenarioFilters: React.FC<ScenarioFiltersProps> = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 md:gap-4">
      {/* 検索 */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="シナリオを検索（タイトル、作者、説明、ジャンル）..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 text-sm sm:text-base"
        />
      </div>

      {/* ステータスフィルタ */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-40 text-sm sm:text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全てのステータス</SelectItem>
            <SelectItem value="available">利用可能</SelectItem>
            <SelectItem value="unavailable">利用不可</SelectItem>
            <SelectItem value="retired">廃盤</SelectItem>
            <SelectItem value="preparing">準備中</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

