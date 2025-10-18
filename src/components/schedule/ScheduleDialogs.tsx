// スケジュール管理の各種ダイアログ

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ScheduleEvent } from '@/types/schedule'

interface ScheduleDialogsProps {
  // 削除ダイアログ
  isDeleteDialogOpen: boolean
  deletingEvent: ScheduleEvent | null
  onDeleteDialogClose: () => void
  onConfirmDelete: () => void

  // 中止ダイアログ
  isCancelDialogOpen: boolean
  cancellingEvent: ScheduleEvent | null
  onCancelDialogClose: () => void
  onConfirmCancel: () => void

  // 公開ダイアログ
  isPublishDialogOpen: boolean
  publishingEvent: ScheduleEvent | null
  onPublishDialogClose: () => void
  onConfirmPublishToggle: () => void
}

export function ScheduleDialogs({
  isDeleteDialogOpen,
  deletingEvent,
  onDeleteDialogClose,
  onConfirmDelete,
  isCancelDialogOpen,
  cancellingEvent,
  onCancelDialogClose,
  onConfirmCancel,
  isPublishDialogOpen,
  publishingEvent,
  onPublishDialogClose,
  onConfirmPublishToggle
}: ScheduleDialogsProps) {
  return (
    <>
      {/* 削除確認ダイアログ */}
      {isDeleteDialogOpen && deletingEvent && (
        <Dialog open={isDeleteDialogOpen} onOpenChange={onDeleteDialogClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>公演を削除</DialogTitle>
              <DialogDescription>
                この公演を削除してもよろしいですか？この操作は取り消せません。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p><strong>日付:</strong> {deletingEvent.date}</p>
              <p><strong>時間:</strong> {deletingEvent.start_time.slice(0, 5)} - {deletingEvent.end_time.slice(0, 5)}</p>
              <p><strong>シナリオ:</strong> {deletingEvent.scenario || '未定'}</p>
              <p><strong>GM:</strong> {deletingEvent.gms.join(', ') || '未定'}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onDeleteDialogClose}>
                キャンセル
              </Button>
              <Button variant="destructive" onClick={onConfirmDelete}>
                削除
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 中止確認ダイアログ */}
      {isCancelDialogOpen && cancellingEvent && (
        <Dialog open={isCancelDialogOpen} onOpenChange={onCancelDialogClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>公演を中止</DialogTitle>
              <DialogDescription>
                この公演を中止してもよろしいですか？中止後も復活させることができます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p><strong>日付:</strong> {cancellingEvent.date}</p>
              <p><strong>時間:</strong> {cancellingEvent.start_time.slice(0, 5)} - {cancellingEvent.end_time.slice(0, 5)}</p>
              <p><strong>シナリオ:</strong> {cancellingEvent.scenario || '未定'}</p>
              <p><strong>GM:</strong> {cancellingEvent.gms.join(', ') || '未定'}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancelDialogClose}>
                キャンセル
              </Button>
              <Button variant="destructive" onClick={onConfirmCancel}>
                中止
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* 予約サイト公開/非公開確認ダイアログ */}
      {publishingEvent && (
        <Dialog open={isPublishDialogOpen} onOpenChange={onPublishDialogClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {publishingEvent.is_reservation_enabled ? '予約サイトから非公開にする' : '予約サイトに公開する'}
              </DialogTitle>
              <DialogDescription>
                {publishingEvent.is_reservation_enabled 
                  ? 'この公演を予約サイトから非公開にしてもよろしいですか？'
                  : 'この公演を予約サイトに公開してもよろしいですか？お客様が予約できるようになります。'
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 bg-muted/50 p-4 rounded">
              <p><strong>日付:</strong> {publishingEvent.date}</p>
              <p><strong>時間:</strong> {publishingEvent.start_time.slice(0, 5)} - {publishingEvent.end_time.slice(0, 5)}</p>
              <p><strong>シナリオ:</strong> {publishingEvent.scenario || '未定'}</p>
              <p><strong>GM:</strong> {publishingEvent.gms.join(', ') || '未定'}</p>
              <p><strong>最大参加者数:</strong> {publishingEvent.max_participants || 8}名</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onPublishDialogClose}>
                キャンセル
              </Button>
              <Button 
                onClick={onConfirmPublishToggle}
                className={publishingEvent.is_reservation_enabled ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'}
              >
                {publishingEvent.is_reservation_enabled ? '非公開にする' : '公開する'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

