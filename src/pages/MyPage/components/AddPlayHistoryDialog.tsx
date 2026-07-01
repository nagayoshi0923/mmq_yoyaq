import type { Dispatch, SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'

interface AddPlayHistoryDialogProps {
  isAddDialogOpen: boolean
  setIsAddDialogOpen: Dispatch<SetStateAction<boolean>>
  scenarioOptions: { id: string; title: string }[]
  storeOptions: { id: string; name: string }[]
  optionsLoading: boolean
  newScenarioId: string
  setNewScenarioId: Dispatch<SetStateAction<string>>
  newPlayedAt: string
  setNewPlayedAt: Dispatch<SetStateAction<string>>
  newStoreId: string
  setNewStoreId: Dispatch<SetStateAction<string>>
  handleAddManualHistory: () => void | Promise<void>
  addManualHistoryMutation: { isPending: boolean }
}

/** 「過去の体験を追加」ダイアログ。MyPage の album タブから逐語抽出（presentational・挙動不変） */
export function AddPlayHistoryDialog({
  isAddDialogOpen,
  setIsAddDialogOpen,
  scenarioOptions,
  storeOptions,
  optionsLoading,
  newScenarioId,
  setNewScenarioId,
  newPlayedAt,
  setNewPlayedAt,
  newStoreId,
  setNewStoreId,
  handleAddManualHistory,
  addManualHistoryMutation,
}: AddPlayHistoryDialogProps) {
  return (
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1">
                          <Plus className="h-4 w-4" />
                          <span className="hidden sm:inline">過去の体験を追加</span>
                          <span className="sm:hidden">追加</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>過去の体験を追加</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>シナリオ *</Label>
                            <SearchableSelect
                              options={scenarioOptions.map((s): SearchableSelectOption => ({
                                value: s.id,
                                label: s.title
                              }))}
                              value={newScenarioId}
                              onValueChange={setNewScenarioId}
                              placeholder={optionsLoading ? '読み込み中...' : scenarioOptions.length === 0 ? 'シナリオがありません' : 'シナリオを選択'}
                              searchPlaceholder="シナリオを検索..."
                              emptyText="シナリオが見つかりません"
                              disabled={optionsLoading || scenarioOptions.length === 0}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>プレイした日付（任意）</Label>
                            <SingleDatePopover
                              date={newPlayedAt}
                              onDateChange={(date) => setNewPlayedAt(date || '')}
                              placeholder="日付を選択"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>店舗（任意）</Label>
                            <SearchableSelect
                              options={storeOptions.map((s): SearchableSelectOption => ({
                                value: s.id,
                                label: s.name
                              }))}
                              value={newStoreId}
                              onValueChange={setNewStoreId}
                              placeholder={optionsLoading ? '読み込み中...' : storeOptions.length === 0 ? '店舗がありません' : '店舗を選択'}
                              searchPlaceholder="店舗を検索..."
                              emptyText="店舗が見つかりません"
                              disabled={optionsLoading || storeOptions.length === 0}
                              allowClear={true}
                            />
                          </div>
                          <Button
                            onClick={handleAddManualHistory}
                            disabled={addManualHistoryMutation.isPending || !newScenarioId}
                            className="w-full"
                          >
                            {addManualHistoryMutation.isPending ? '追加中...' : '追加'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
  )
}
