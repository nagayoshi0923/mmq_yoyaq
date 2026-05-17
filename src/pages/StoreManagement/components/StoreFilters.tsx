import { memo, type ReactNode } from 'react'
import { Search, Filter, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StoreFiltersProps {
  searchTerm: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onAddClick: () => void
  resultCount?: number
  columnSettingsPanel?: ReactNode
}

export const StoreFilters = memo(function StoreFilters({
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onAddClick,
  resultCount,
  columnSettingsPanel,
}: StoreFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
      {resultCount !== undefined && (
        <span className="hidden sm:flex items-center text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
          {resultCount}件
        </span>
      )}

      <div className="relative flex-1 max-w-md min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="店舗名で検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 text-sm"
        />
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            <SelectItem value="active">営業中</SelectItem>
            <SelectItem value="temporarily_closed">一時休業</SelectItem>
            <SelectItem value="closed">閉鎖</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={onAddClick}
        size="sm"
        className="flex-shrink-0"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        <span className="hidden sm:inline">新規店舗</span>
        <span className="sm:hidden">新規</span>
      </Button>

      {columnSettingsPanel && (
        <div className="hidden sm:block ml-auto flex-shrink-0">
          {columnSettingsPanel}
        </div>
      )}
    </div>
  )
})
