// スケジュール管理 モバイル用フィルターパネル
// ScheduleManager/index.tsx から presentational 抽出（byte 逐語移送・挙動不変）
import React from 'react'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import type { Staff } from '@/types'
import type { useScheduleTable } from '@/hooks/useScheduleTable'

interface ScheduleMobileFiltersProps {
  gmList: Staff[]
  scheduleTableProps: ReturnType<typeof useScheduleTable>
  selectedGMs: string[]
  setSelectedGMs: React.Dispatch<React.SetStateAction<string[]>>
  selectedStores: string[]
  setSelectedStores: React.Dispatch<React.SetStateAction<string[]>>
  scenarioOptions: MultiSelectOption[]
  selectedScenarioIds: string[]
  setSelectedScenarioIds: React.Dispatch<React.SetStateAction<string[]>>
  categoryOptions: MultiSelectOption[]
  selectedCategories: string[]
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>
}

export function ScheduleMobileFilters({
  gmList,
  scheduleTableProps,
  selectedGMs,
  setSelectedGMs,
  selectedStores,
  setSelectedStores,
  scenarioOptions,
  selectedScenarioIds,
  setSelectedScenarioIds,
  categoryOptions,
  selectedCategories,
  setSelectedCategories,
}: ScheduleMobileFiltersProps) {
  return (
          <div className="sm:hidden border-t border-input divide-y divide-input">
            {gmList.length > 0 && (
              <MultiSelect
                options={(() => {
                  const shiftData = scheduleTableProps.dataProvider.shiftData || {}
                  const staffWithShift = new Set<string>()
                  Object.values(shiftData).forEach((staffList: Staff[]) => {
                    staffList.forEach(s => staffWithShift.add(s.id))
                  })
                  return [...gmList]
                    .sort((a, b) => {
                      const aHas = staffWithShift.has(a.id)
                      const bHas = staffWithShift.has(b.id)
                      if (aHas && !bHas) return -1
                      if (!aHas && bHas) return 1
                      return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'ja')
                    })
                    .map(staff => ({
                      id: staff.id,
                      name: staff.display_name || staff.name,
                      displayInfo: staffWithShift.has(staff.id) ? (
                        <span className="text-[9px] text-green-600">●</span>
                      ) : undefined,
                    }))
                })()}
                selectedValues={selectedGMs}
                onSelectionChange={setSelectedGMs}
                placeholder="スタッフで絞り込み"
                closeOnSelect={false}
                useIdAsValue={true}
                className="h-10 w-full border-0 rounded-none shadow-none"
              />
            )}
            {scheduleTableProps.viewConfig.stores.length > 0 && (
              <StoreMultiSelect
                stores={scheduleTableProps.viewConfig.stores}
                selectedStoreIds={selectedStores}
                onStoreIdsChange={setSelectedStores}
                hideLabel={true}
                placeholder="店舗で絞り込み"
                className="w-full"
                triggerClassName="h-10 w-full border-0 rounded-none shadow-none text-xs"
                triggerStyle={{ backgroundColor: '#F6F9FB' }}
              />
            )}
            {scenarioOptions.length > 0 && (
              <MultiSelect
                options={scenarioOptions}
                selectedValues={selectedScenarioIds}
                onSelectionChange={(values) => setSelectedScenarioIds(values.slice(-1))}
                placeholder="シナリオで絞り込み"
                searchPlaceholder="シナリオ検索..."
                closeOnSelect={true}
                useIdAsValue={true}
                className="h-10 w-full border-0 rounded-none shadow-none"
              />
            )}
            <MultiSelect
              options={categoryOptions}
              selectedValues={selectedCategories}
              onSelectionChange={setSelectedCategories}
              placeholder="カテゴリで絞り込み"
              closeOnSelect={false}
              useIdAsValue={true}
              className="h-10 w-full border-0 rounded-none shadow-none"
            />
            {(selectedGMs.length > 0 || selectedStores.length > 0 || selectedScenarioIds.length > 0 || selectedCategories.length > 0) && (
              <button
                onClick={() => {
                  setSelectedGMs([])
                  setSelectedStores([])
                  setSelectedScenarioIds([])
                  setSelectedCategories([])
                }}
                className="w-full h-9 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                フィルターをクリア
              </button>
            )}
          </div>
  )
}
