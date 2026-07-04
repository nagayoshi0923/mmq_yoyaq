// スケジュール管理ツールバー（sticky ヘッダー内の操作行）
// ScheduleManager/index.tsx から presentational 抽出（byte 逐語移送・挙動不変）
import React from 'react'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { HelpButton } from '@/components/ui/help-button'
import { ActionMenu } from '@/components/patterns/action'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, SlidersHorizontal, Wrench, Users, Package, Download, Upload } from 'lucide-react'
import type { Staff } from '@/types'
import type { useScheduleTable } from '@/hooks/useScheduleTable'

interface ScheduleToolbarProps {
  currentDate: Date
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>
  scheduleTableProps: ReturnType<typeof useScheduleTable>
  gmList: Staff[]
  selectedGMs: string[]
  setSelectedGMs: React.Dispatch<React.SetStateAction<string[]>>
  selectedStores: string[]
  setSelectedStores: React.Dispatch<React.SetStateAction<string[]>>
  scenarioOptions: MultiSelectOption[]
  selectedScenarioIds: string[]
  setSelectedScenarioIds: React.Dispatch<React.SetStateAction<string[]>>
  shiftStaffOptions: MultiSelectOption[]
  selectedShiftStaff: string[]
  setSelectedShiftStaff: React.Dispatch<React.SetStateAction<string[]>>
  categoryOptions: MultiSelectOption[]
  selectedCategories: string[]
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>
  selectedScenarioId: string | null
  selectedScenarioTitle: string | null
  scenarioMatchedDates: string[]
  jumpScenarioMatch: (direction: 'prev' | 'next') => void
  scrollToDate: (date: string) => void
  showMobileFilters: boolean
  setShowMobileFilters: React.Dispatch<React.SetStateAction<boolean>>
  isAdminOrLicenseAdmin: boolean
  handleCleanupBadDemoReservations: () => void
  isCleaningDemo: boolean
  setIsFillSeatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  isFillingSeats: boolean
  setIsKitManagementOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  isExporting: boolean
  setIsImportModalOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function ScheduleToolbar({
  currentDate,
  setCurrentDate,
  scheduleTableProps,
  gmList,
  selectedGMs,
  setSelectedGMs,
  selectedStores,
  setSelectedStores,
  scenarioOptions,
  selectedScenarioIds,
  setSelectedScenarioIds,
  shiftStaffOptions,
  selectedShiftStaff,
  setSelectedShiftStaff,
  categoryOptions,
  selectedCategories,
  setSelectedCategories,
  selectedScenarioId,
  selectedScenarioTitle,
  scenarioMatchedDates,
  jumpScenarioMatch,
  scrollToDate,
  showMobileFilters,
  setShowMobileFilters,
  isAdminOrLicenseAdmin,
  handleCleanupBadDemoReservations,
  isCleaningDemo,
  setIsFillSeatsModalOpen,
  isFillingSeats,
  setIsKitManagementOpen,
  setIsExportModalOpen,
  isExporting,
  setIsImportModalOpen,
}: ScheduleToolbarProps) {
  return (
        <div className="flex items-center h-12 gap-2">
          {/* 月切り替え - 連結ボタングループ */}
          <div className="flex items-center shrink-0 border border-input rounded-lg overflow-hidden bg-background">
            <button
              onClick={() => {
                const newDate = new Date(currentDate)
                newDate.setMonth(newDate.getMonth() - 1)
                setCurrentDate(newDate)
              }}
              className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-r border-input"
              title="前月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center px-1">
              <select
                value={currentDate.getFullYear()}
                onChange={(e) => {
                  const newDate = new Date(currentDate)
                  newDate.setFullYear(parseInt(e.target.value))
                  setCurrentDate(newDate)
                }}
                className="h-9 w-[70px] px-1 text-sm font-semibold bg-transparent hover:bg-accent transition-colors cursor-pointer text-center appearance-none"
              >
                {Array.from({ length: 10 }, (_, i) => 2021 + i).map(y => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                value={currentDate.getMonth() + 1}
                onChange={(e) => {
                  const newDate = new Date(currentDate)
                  newDate.setMonth(parseInt(e.target.value) - 1)
                  setCurrentDate(newDate)
                }}
                className="h-9 w-[50px] px-1 text-sm font-semibold bg-transparent hover:bg-accent transition-colors cursor-pointer text-center appearance-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const newDate = new Date(currentDate)
                newDate.setMonth(newDate.getMonth() + 1)
                setCurrentDate(newDate)
              }}
              className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-l border-input"
              title="次月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          {/* 区切り線 */}
          <div className="hidden sm:block h-6 w-px bg-border mx-2" />
          
          {/* フィルター - 連結グループ */}
          <div className="hidden sm:flex items-center h-9 border border-input rounded-lg bg-background flex-1">
            <div className="flex-1 border-r border-input">
              <MultiSelect
                options={(() => {
                  const shiftData = scheduleTableProps.dataProvider.shiftData || {}
                  const staffWithShift = new Set<string>()
                  Object.values(shiftData).forEach((staffList: Staff[]) => {
                    staffList.forEach(s => staffWithShift.add(s.id))
                  })
                  return [...gmList]
                    .sort((a, b) => {
                      const aHasShift = staffWithShift.has(a.id)
                      const bHasShift = staffWithShift.has(b.id)
                      if (aHasShift && !bHasShift) return -1
                      if (!aHasShift && bHasShift) return 1
                      return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'ja')
                    })
                    .map((staff) => {
                      const hasShift = staffWithShift.has(staff.id)
                      return {
                        id: staff.id,
                        name: staff.display_name || staff.name,
                        displayInfo: hasShift ? (
                          <span className="text-[9px] text-green-600">●</span>
                        ) : undefined,
                        displayInfoSearchText: hasShift ? '提出済' : undefined
                      }
                    })
                })()}
                selectedValues={selectedGMs}
                onSelectionChange={setSelectedGMs}
                placeholder="スタッフ"
                closeOnSelect={false}
                useIdAsValue={true}
                className="h-9 w-full border-0 rounded-none shadow-none"
              />
            </div>

            <div className="flex-1 border-r border-input">
              <StoreMultiSelect
                stores={scheduleTableProps.viewConfig.stores}
                selectedStoreIds={selectedStores}
                onStoreIdsChange={setSelectedStores}
                hideLabel={true}
                placeholder="店舗"
                className="w-full"
                triggerClassName="h-9 w-full border-0 rounded-none shadow-none text-xs"
                triggerStyle={{ backgroundColor: '#F6F9FB' }}
              />
            </div>

            <div className="flex-1 border-r border-input">
              <MultiSelect
                options={scenarioOptions}
                selectedValues={selectedScenarioIds}
                onSelectionChange={(values) => setSelectedScenarioIds(values.slice(-1))}
                placeholder="シナリオ"
                searchPlaceholder="シナリオ検索..."
                closeOnSelect={true}
                useIdAsValue={true}
                className="h-9 w-full border-0 rounded-none shadow-none"
              />
            </div>

            <div className="flex-1 border-r border-input">
              <MultiSelect
                options={shiftStaffOptions}
                selectedValues={selectedShiftStaff}
                onSelectionChange={setSelectedShiftStaff}
                placeholder="出勤者"
                closeOnSelect={false}
                useIdAsValue={true}
                className="h-9 w-full border-0 rounded-none shadow-none"
              />
            </div>

            {/* カテゴリフィルター */}
            <div className="flex-1">
              <MultiSelect
                options={categoryOptions}
                selectedValues={selectedCategories}
                onSelectionChange={setSelectedCategories}
                placeholder="カテゴリ"
                closeOnSelect={false}
                useIdAsValue={true}
                className="h-9 w-full border-0 rounded-none shadow-none"
              />
            </div>

            {(selectedGMs.length > 0 || selectedStores.length > 0 || selectedScenarioIds.length > 0 || selectedShiftStaff.length > 0 || selectedCategories.length > 0) && (
              <button
                onClick={() => {
                  setSelectedGMs([])
                  setSelectedStores([])
                  setSelectedScenarioIds([])
                  setSelectedShiftStaff([])
                  setSelectedCategories([])
                }}
                className="h-9 px-3 text-sm text-muted-foreground hover:bg-accent transition-colors border-l border-input whitespace-nowrap"
              >
                クリア
              </button>
            )}

            {/* シナリオ該当日ジャンプ（選択中のみ表示） */}
            {selectedScenarioId && (
              <div className="flex items-center border-l border-input shrink-0">
                <button
                  type="button"
                  onClick={() => jumpScenarioMatch('prev')}
                  disabled={scenarioMatchedDates.length === 0}
                  title="前の該当日へ"
                  className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (scenarioMatchedDates.length > 0) scrollToDate(scenarioMatchedDates[0])
                  }}
                  disabled={scenarioMatchedDates.length === 0}
                  title={selectedScenarioTitle ? `${selectedScenarioTitle} の該当日へ` : '該当日へ'}
                  className="h-9 px-2 text-[11px] text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
                >
                  {scenarioMatchedDates.length}件
                </button>
                <button
                  type="button"
                  onClick={() => jumpScenarioMatch('next')}
                  disabled={scenarioMatchedDates.length === 0}
                  title="次の該当日へ"
                  className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* アクションボタン - スマホ用 */}
          <div className="sm:hidden flex items-center gap-1 ml-auto">
            {/* フィルタートグルボタン */}
            <button
              onClick={() => setShowMobileFilters(v => !v)}
              title="フィルター"
              className={`h-9 w-9 flex items-center justify-center border rounded-lg transition-colors shrink-0 ${
                showMobileFilters
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-input bg-background hover:bg-accent'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {isAdminOrLicenseAdmin && (
              <>
                <button
                  onClick={handleCleanupBadDemoReservations}
                  disabled={isCleaningDemo}
                  title="誤デモ予約の修正"
                  className="h-9 w-9 flex items-center justify-center border border-input rounded-lg bg-background hover:bg-accent transition-colors shrink-0 disabled:opacity-50"
                >
                  {isCleaningDemo ? (
                    <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => setIsFillSeatsModalOpen(true)}
                  disabled={isFillingSeats}
                  title="中止以外を満席にする"
                  className="h-9 w-9 flex items-center justify-center border border-input rounded-lg bg-background hover:bg-accent transition-colors shrink-0 disabled:opacity-50"
                >
                  {isFillingSeats ? (
                    <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                </button>
              </>
            )}
            <button
              onClick={() => setIsKitManagementOpen(true)}
              title="キット配置管理"
              className="h-9 w-9 flex items-center justify-center border border-input rounded-lg bg-background hover:bg-accent transition-colors shrink-0"
            >
              <Package className="h-4 w-4" />
            </button>
          </div>
          
          {/* アクションボタン - PC用連結グループ */}
          <div className="hidden sm:flex items-center h-9 border border-input rounded-lg overflow-hidden bg-background shrink-0 ml-auto">
            <div className="h-9 w-9 flex items-center justify-center border-r border-input">
              <HelpButton topic="schedule" label="スケジュール管理マニュアル" />
            </div>
            <button
              onClick={() => setIsKitManagementOpen(true)}
              title="キット配置管理"
              className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-r border-input"
            >
              <Package className="h-4 w-4" />
            </button>
            <div className={`h-9 flex items-center ${isAdminOrLicenseAdmin ? 'border-r border-input' : ''}`}>
              <ActionMenu
                label="入出力"
                icon={Download}
                variant="ghost"
                size="sm"
                disabled={isExporting}
                className="h-9 rounded-none border-0"
                items={[
                  {
                    label: 'CSVエクスポート',
                    icon: Download,
                    onSelect: () => setIsExportModalOpen(true),
                    disabled: isExporting,
                  },
                  {
                    label: 'インポート',
                    icon: Upload,
                    onSelect: () => setIsImportModalOpen(true),
                  },
                ]}
              />
            </div>
            {isAdminOrLicenseAdmin && (
              <>
                <button
                  onClick={handleCleanupBadDemoReservations}
                  disabled={isCleaningDemo}
                  title="誤デモ予約の修正（テストプレイ削除・GMテスト参加費修正）"
                  className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-r border-input disabled:opacity-50"
                >
                  {isCleaningDemo ? (
                    <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => setIsFillSeatsModalOpen(true)}
                  disabled={isFillingSeats}
                  title="中止以外を満席にする（デモ参加者を追加）"
                  className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {isFillingSeats ? (
                    <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
  )
}
