import { memo, type ReactNode } from 'react'
import { Search, Filter, Mail, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StaffFiltersProps {
  searchTerm: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onAddClick: () => void
  onInviteClick: () => void
  resultCount?: number
  columnSettingsPanel?: ReactNode
}

export const StaffFilters = memo(function StaffFilters({
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onAddClick,
  onInviteClick,
  resultCount,
  columnSettingsPanel,
}: StaffFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
      {/* 件数（左端・PCのみ） */}
      {resultCount !== undefined && (
        <span className="hidden sm:flex items-center text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
          {resultCount}件
        </span>
      )}

      {/* 検索ボックス */}
      <div className="relative flex-1 max-w-md min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="スタッフ名・LINE名で検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 text-sm"
        />
      </div>

      {/* ステータスフィルタ */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            <SelectItem value="active">在籍中</SelectItem>
            <SelectItem value="inactive">休職中</SelectItem>
            <SelectItem value="on_leave">休暇中</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 追加ボタン */}
      <Button
        variant="default"
        onClick={onAddClick}
        className="flex items-center gap-1.5 flex-shrink-0 text-xs"
        size="sm"
      >
        <UserPlus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">スタッフを追加</span>
        <span className="sm:hidden">追加</span>
      </Button>

      {/* 招待ボタン */}
      <Button
        variant="outline"
        onClick={onInviteClick}
        className="flex items-center gap-1.5 flex-shrink-0 text-xs"
        size="sm"
      >
        <Mail className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">招待メールを送る</span>
        <span className="sm:hidden">招待</span>
      </Button>

      {/* カラム設定（右端・PCのみ） */}
      {columnSettingsPanel && (
        <div className="hidden sm:block ml-auto flex-shrink-0">
          {columnSettingsPanel}
        </div>
      )}
    </div>
  )
})

