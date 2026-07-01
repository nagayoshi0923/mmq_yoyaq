import { useState, type Dispatch, type SetStateAction } from 'react'
import { Pencil, RotateCcw, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/patterns/modal'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { formatJstDateJa } from '@/utils/jstDate'
import type { PlayedScenario } from '../index'

interface EditPlayHistoryDialogProps {
  isEditDialogOpen: boolean
  setIsEditDialogOpen: Dispatch<SetStateAction<boolean>>
  setEditingScenario: Dispatch<SetStateAction<PlayedScenario | null>>
  setIsEditingDate: Dispatch<SetStateAction<boolean>>
  editingScenario: PlayedScenario | null
  editingDate: string
  setEditingDate: Dispatch<SetStateAction<string>>
  isEditingDate: boolean
  handleUpdateManualDate: (manualId: string, date: string) => void
  handleUpdateReservationDate: (scenario: PlayedScenario, date: string) => void
  isScenarioOverridden: (scenario: PlayedScenario) => boolean
  isScenarioDeleted: (scenario: PlayedScenario) => boolean
  isScenarioHidden: (scenario: PlayedScenario) => boolean
  handleMarkPlayed: (scenario: PlayedScenario) => void
  handleRestoreDeletedHistory: (scenario: PlayedScenario) => void
  handleShowInAlbum: (scenario: PlayedScenario) => void
  handleHideFromAlbum: (scenario: PlayedScenario) => void
  handleMarkUnplayed: (scenario: PlayedScenario) => void
  handleDeleteManualHistory: (manualId: string) => void
  handleDeleteReservationHistory: (scenario: PlayedScenario) => void
}

/** プレイ履歴の編集ダイアログ。MyPage の album タブから逐語抽出（presentational・挙動不変） */
export function EditPlayHistoryDialog({
  isEditDialogOpen,
  setIsEditDialogOpen,
  setEditingScenario,
  setIsEditingDate,
  editingScenario,
  editingDate,
  setEditingDate,
  isEditingDate,
  handleUpdateManualDate,
  handleUpdateReservationDate,
  isScenarioOverridden,
  isScenarioDeleted,
  isScenarioHidden,
  handleMarkPlayed,
  handleRestoreDeletedHistory,
  handleShowInAlbum,
  handleHideFromAlbum,
  handleMarkUnplayed,
  handleDeleteManualHistory,
  handleDeleteReservationHistory,
}: EditPlayHistoryDialogProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const deleteMessage = editingScenario?.is_manual
    ? 'この履歴を完全に削除しますか？この操作は取り消せません。'
    : 'この履歴を削除しますか？'

  return (
    <>
                <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
                  setIsEditDialogOpen(open)
                  if (!open) {
                    setDeleteConfirmOpen(false)
                    setEditingScenario(null)
                    setIsEditingDate(false)
                  }
                }}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>プレイ履歴の編集</DialogTitle>
                    </DialogHeader>
                    {editingScenario && (
                      <div className="space-y-4 pt-2">
                        {/* シナリオ情報 */}
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          {editingScenario.key_visual_url ? (
                            <img
                              src={editingScenario.key_visual_url}
                              alt={editingScenario.scenario}
                              className="w-16 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center">
                              <span className="text-xl opacity-50">🎭</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {editingScenario.scenario || '（タイトル不明）'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {editingScenario.venue && editingScenario.venue !== '店舗情報なし' && editingScenario.venue}
                            </p>
                          </div>
                        </div>

                        {/* 日付編集 */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">プレイした日付</Label>
                          {isEditingDate ? (
                            <div className="flex gap-2">
                              <SingleDatePopover
                                date={editingDate}
                                onDateChange={(date) => setEditingDate(date || '')}
                                placeholder="日付を選択"
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (editingScenario.is_manual && editingScenario.manual_id) {
                                    handleUpdateManualDate(editingScenario.manual_id, editingDate)
                                  } else {
                                    handleUpdateReservationDate(editingScenario, editingDate)
                                  }
                                }}
                                disabled={!editingDate}
                              >
                                保存
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setIsEditingDate(false)
                                  setEditingDate(editingScenario.date || '')
                                }}
                              >
                                キャンセル
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700">
                                {editingScenario.date ? formatJstDateJa(editingScenario.date) : '日付不明'}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsEditingDate(true)}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                編集
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* アクションボタン */}
                        <div className="space-y-2 pt-2 border-t">
                          {isScenarioOverridden(editingScenario) ? (
                            /* 未体験に戻されている → 体験済みに戻す */
                            <Button
                              variant="outline"
                              className="w-full justify-start gap-3"
                              onClick={() => handleMarkPlayed(editingScenario)}
                            >
                              <RotateCcw className="h-4 w-4 text-green-600" />
                              <span>体験済みに戻す</span>
                            </Button>
                          ) : isScenarioDeleted(editingScenario) ? (
                            /* 削除済みの場合は復元ボタン */
                            <Button
                              variant="outline"
                              className="w-full justify-start gap-3"
                              onClick={() => handleRestoreDeletedHistory(editingScenario)}
                            >
                              <Eye className="h-4 w-4 text-green-600" />
                              <span>履歴を復元する</span>
                            </Button>
                          ) : (
                            <>
                              {/* 非表示/再表示（アルバムの表示整理だけ・体験済みのまま） */}
                              {isScenarioHidden(editingScenario) ? (
                                <Button
                                  variant="outline"
                                  className="w-full justify-start gap-3"
                                  onClick={() => handleShowInAlbum(editingScenario)}
                                >
                                  <Eye className="h-4 w-4 text-green-600" />
                                  <span>アルバムに再表示する</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  className="w-full justify-start gap-3"
                                  onClick={() => handleHideFromAlbum(editingScenario)}
                                >
                                  <EyeOff className="h-4 w-4 text-gray-500" />
                                  <span>アルバムから非表示にする</span>
                                </Button>
                              )}

                              {/* 未体験に戻す（記録の訂正・予約サイト/詳細にも反映）。予約由来の登録顧客のみ */}
                              {!editingScenario.is_manual && editingScenario.scenario_id && (
                                <Button
                                  variant="outline"
                                  className="w-full justify-start gap-3 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                  onClick={() => handleMarkUnplayed(editingScenario)}
                                >
                                  <RotateCcw className="h-4 w-4 text-amber-600" />
                                  <span>未体験に戻す</span>
                                </Button>
                              )}

                              {/* 削除ボタン */}
                              <Button
                                variant="outline"
                                className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteConfirmOpen(true)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>履歴を削除する</span>
                              </Button>
                            </>
                          )}
                        </div>

                        <p className="text-xs text-gray-400">
                          {editingScenario.is_manual
                            ? '手動で追加した履歴です。削除すると完全に消去されます。'
                            : '「非表示」はアルバムの表示整理だけ（体験済みのまま）。「未体験に戻す」は予約サイトでも未体験になります。どちらもいつでも戻せます。'}
                        </p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="履歴を削除しますか？"
        message={deleteMessage}
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={() => {
          if (!editingScenario) return
          if (editingScenario.is_manual && editingScenario.manual_id) {
            handleDeleteManualHistory(editingScenario.manual_id)
          } else {
            handleDeleteReservationHistory(editingScenario)
          }
        }}
      />
    </>
  )
}
