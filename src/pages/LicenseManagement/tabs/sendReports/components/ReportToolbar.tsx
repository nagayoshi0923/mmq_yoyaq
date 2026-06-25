/**
 * 送信報告タブのツールバー（月送り＋一括送信／検索・ソート・表示モード）。
 * SendReports から子コンポーネント抽出・挙動不変。JSX を逐語移植しクロージャ参照を props 化。
 * 2 ブロックは Fragment で返す（親の space-y-6 はそのまま効く）。
 */
import { Loader2, MailCheck, Search, ChevronUp, ChevronDown, Layers, Home, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthSwitcher } from '@/components/patterns/calendar'
import type { ReportSortKey } from '../sorting'

type ViewMode = 'all' | 'internal' | 'external'

interface ReportToolbarProps {
  currentDate: Date
  onChangeMonth: (date: Date) => void
  isSaving: boolean
  selectedCount: number
  onDeselectAll: () => void
  onBatchSend: () => void
  isSending: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  sortKey: ReportSortKey
  onSortKeyChange: (key: ReportSortKey) => void
  sortAsc: boolean
  onToggleSortAsc: () => void
  isLicenseManager: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function ReportToolbar({
  currentDate,
  onChangeMonth,
  isSaving,
  selectedCount,
  onDeselectAll,
  onBatchSend,
  isSending,
  searchQuery,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  sortAsc,
  onToggleSortAsc,
  isLicenseManager,
  viewMode,
  onViewModeChange,
}: ReportToolbarProps) {
  return (
    <>
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <MonthSwitcher value={currentDate} onChange={onChangeMonth} />
          {isSaving && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>保存中...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onDeselectAll}>
              選択解除
            </Button>
          )}
          <Button
            onClick={onBatchSend}
            disabled={isSending || selectedCount === 0}
          >
            <MailCheck className="w-4 h-4 mr-2" />
            {isSending ? '送信中...' : `一括送信 (${selectedCount}件)`}
          </Button>
        </div>
      </div>

      {/* 検索・ソート・表示モード切り替え */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="作者名・シナリオ名で検索..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* ソート切り替え */}
        <Select
          value={sortKey}
          onValueChange={(value) => onSortKeyChange(value as ReportSortKey)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hasEvents">公演あり優先</SelectItem>
            <SelectItem value="name">名前順</SelectItem>
            <SelectItem value="email">メアド順</SelectItem>
            <SelectItem value="events">公演数順</SelectItem>
            <SelectItem value="cost">金額順</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleSortAsc}
          title={sortAsc ? '昇順' : '降順'}
        >
          {sortAsc ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        {/* 表示モード切り替え */}
        {isLicenseManager && (
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            <Button
              variant={viewMode === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('all')}
              className="gap-1"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">合計</span>
            </Button>
            <Button
              variant={viewMode === 'internal' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('internal')}
              className="gap-1"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">自社</span>
            </Button>
            <Button
              variant={viewMode === 'external' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('external')}
              className="gap-1"
            >
              <Building className="w-4 h-4" />
              <span className="hidden sm:inline">他社</span>
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
