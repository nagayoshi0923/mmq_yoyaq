/**
 * 候補日を追加・編集する画面（全画面のダイアログ）。マイページの貸切カード（PrivateGroupInPlaceDialog）と
 * グループ画面の日程タブで同じ見た目・同じ部品（AddCandidateDates の dialog 版）を使う。
 * スマホ（〜640px）は全画面（上に閉じる、下に保存列を固定）、PC は中央で幅 lg・高さ 90vh。
 * スクロールは本文の 1 つだけ（カレンダーの枠の中ではスクロールさせない）。
 */
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const CANDIDATE_DATES_DIALOG_CLASS =
  'flex flex-col gap-0 overflow-hidden p-0 sm:p-0 md:p-0 sm:max-w-lg sm:max-h-[90vh] ' +
  'max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none ' +
  'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0'

export const CANDIDATE_DATES_DIALOG_HEADER_CLASS = 'shrink-0 space-y-0.5 border-b px-3.5 py-3 pr-12 text-left'
export const CANDIDATE_DATES_DIALOG_BODY_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain'

interface CandidateDatesDialogProps {
  open: boolean
  onClose: () => void
  /** 2 行目（作品名・希望店舗） */
  description: string
  children: ReactNode
  title?: string
}

export function CandidateDatesDialog({ open, onClose, description, children, title = '候補日を追加・編集' }: CandidateDatesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className={CANDIDATE_DATES_DIALOG_CLASS} data-testid="candidate-dates-dialog">
        <DialogHeader className={CANDIDATE_DATES_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          <DialogDescription className="truncate text-xs">{description}</DialogDescription>
        </DialogHeader>
        <div className={CANDIDATE_DATES_DIALOG_BODY_CLASS} data-testid="candidate-dates-dialog-body">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
