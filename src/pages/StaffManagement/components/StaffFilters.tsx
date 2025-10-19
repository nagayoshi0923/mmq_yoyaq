import { memo } from 'react'
import { Search, Filter, Mail, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StaffFiltersProps {
  searchTerm: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onInviteClick: () => void
  onCreateClick: () => void
}

/**
 * スタッフ検索・フィルタUIコンポーネント
 */
export const StaffFilters = memo(function StaffFilters({
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onInviteClick,
  onCreateClick
}: StaffFiltersProps) {
  return (
    <div className="flex gap-4 items-center">
      {/* 検索ボックス */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="スタッフ名・LINE名で検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-4"
        />
      </div>
      
      {/* ステータスフィルタ */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-32">
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
        className="flex items-center gap-2"
      >
        <Mail className="h-4 w-4" />
        スタッフを招待
      </Button>

      {/* 新規作成ボタン */}
      <Button 
        onClick={onCreateClick}
        className="flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        新規作成
      </Button>
    </div>
  )
})

