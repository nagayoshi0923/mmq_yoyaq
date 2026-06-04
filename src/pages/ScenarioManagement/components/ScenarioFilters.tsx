import React from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Search, Filter, ArrowUpDown } from 'lucide-react'

type SortState = { field: string; direction: 'asc' | 'desc' } | undefined

interface ScenarioFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  sortState?: SortState
  onSortChange?: (sortState: SortState) => void
}

// 並び順プリセットの値 ↔ sortState 変換
const SORT_PRESETS: Record<string, SortState> = {
  default: undefined,
  'created_at:desc': { field: 'created_at', direction: 'desc' },
  'created_at:asc': { field: 'created_at', direction: 'asc' },
}

function sortStateToPreset(s: SortState): string {
  if (!s) return 'default'
  const key = `${s.field}:${s.direction}`
  return key in SORT_PRESETS ? key : 'default'
}

/**
 * シナリオ検索・フィルタコンポーネント
 */
export const ScenarioFilters: React.FC<ScenarioFiltersProps> = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortState,
  onSortChange
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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

      {/* 並び順 */}
      {onSortChange && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select
            value={sortStateToPreset(sortState)}
            onValueChange={(v) => onSortChange(SORT_PRESETS[v])}
          >
            <SelectTrigger className="w-full sm:w-44 text-sm sm:text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">デフォルト順</SelectItem>
              <SelectItem value="created_at:desc">登録日（新しい順）</SelectItem>
              <SelectItem value="created_at:asc">登録日（古い順）</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

