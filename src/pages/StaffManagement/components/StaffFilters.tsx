import { memo } from 'react'
import { Search, Filter, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StaffFiltersProps {
  searchTerm: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onInviteClick: () => void
}

/**
 * スタッフ検索・フィルタUIコンポーネント
 */
export const StaffFilters = memo(function StaffFilters({
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onInviteClick
}: StaffFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      {/* 検索ボックス */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="スタッフ名・LINE名で検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-4 text-sm sm:text-base"
        />
      </div>
      
      {/* ステータスフィルタ */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-32 text-sm sm:text-base">
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

        {/* 招待ボタン */}
        <Button 
          variant="outline"
          onClick={onInviteClick}
        className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-xs sm:text-sm"
          size="sm"
        >
          <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">スタッフを招待</span>
          <span className="sm:hidden">招待</span>
        </Button>
    </div>
  )
})

