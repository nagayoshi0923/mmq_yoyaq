/**
 * 貸切リクエスト管理の検索・絞り込み（全タブ横断で効く。件数バッジにも反映）。index.tsx から見た目を変えずに切り出したもの。
 */
import { SearchInput, FilterBar, FilterSelect } from '@/components/patterns/filter'
import { TemplateEditButton } from '@/components/settings/TemplateEditButton'
import { DateRangePopover } from '@/components/ui/date-range-popover'

export function RequestFilterToolbar({ hasActiveFilters, setSearchText, setScenarioFilter, setStoreFilter, setDateRangeStart, setDateRangeEnd, organizationId, searchText, scenarioFilter, storeFilter, scenarioOptions, storeOptions, dateRangeStart, dateRangeEnd, handleDateRangeChange, displayLimit, setDisplayLimit }: {
  hasActiveFilters: boolean
  setSearchText: (v: string) => void
  setScenarioFilter: (v: string) => void
  setStoreFilter: (v: string) => void
  setDateRangeStart: (v: string | undefined) => void
  setDateRangeEnd: (v: string | undefined) => void
  organizationId: string | null
  searchText: string
  scenarioFilter: string
  storeFilter: string
  scenarioOptions: string[]
  storeOptions: string[]
  dateRangeStart: string | undefined
  dateRangeEnd: string | undefined
  handleDateRangeChange: (start?: string, end?: string) => void
  displayLimit: string
  setDisplayLimit: (v: string) => void
}) {
  return (
    <FilterBar
      isDirty={hasActiveFilters}
      onReset={() => {
        setSearchText('')
        setScenarioFilter('all')
        setStoreFilter('all')
        setDateRangeStart(undefined)
        setDateRangeEnd(undefined)
      }}
    >
      <TemplateEditButton
        templateKey="private_request_template"
        organizationId={organizationId}
        label="受付メールのテンプレを編集"
        className="h-8 text-xs text-purple-700 hover:text-purple-900"
      />
      <SearchInput
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="予約番号・名前・メール・シナリオで検索"
        containerClassName="flex-1 min-w-[280px] max-w-md"
      />
      <FilterSelect
        value={scenarioFilter}
        onValueChange={setScenarioFilter}
        className="w-[150px]"
        options={[
          { value: 'all', label: 'シナリオ: 全て' },
          ...scenarioOptions.map(title => ({ value: title, label: title })),
        ]}
      />
      <FilterSelect
        value={storeFilter}
        onValueChange={setStoreFilter}
        className="w-[130px]"
        options={[
          { value: 'all', label: '店舗: 全て' },
          ...storeOptions.map(name => ({ value: name, label: name })),
        ]}
      />
      <DateRangePopover
        startDate={dateRangeStart}
        endDate={dateRangeEnd}
        onDateChange={handleDateRangeChange}
        label={dateRangeStart || dateRangeEnd
          ? `${dateRangeStart || ''}〜${dateRangeEnd || ''}`
          : '期間指定'}
        buttonClassName="!w-auto min-w-[110px] !h-8 text-xs input-bg rounded"
      />
      <FilterSelect
        value={displayLimit}
        onValueChange={setDisplayLimit}
        className="w-[110px]"
        options={[
          { value: '20', label: '最新20件' },
          { value: '50', label: '最新50件' },
          { value: '100', label: '最新100件' },
          { value: 'all', label: '全件表示' },
        ]}
      />
    </FilterBar>
  )
}
