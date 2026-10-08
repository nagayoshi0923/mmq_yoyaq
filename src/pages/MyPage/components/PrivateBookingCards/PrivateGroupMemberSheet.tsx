/**
 * メンバー管理シート（「操作」メニューの「メンバーを管理」）。マイページ・グループ画面で共通。
 * 一覧: 名前・立場（主催者／会員／ゲスト）・日程回答の状況・参加日。各行に「外す」（自分の行には出さない）。
 * 外すときはチャットに記録し、申込済み・確定後は店舗へ人数変更として知らせる（private_group_remove_member_with_notice）。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/patterns/modal'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { getErrorMessage } from '@/lib/errorFields'
import { formatJstMonthDay } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import { removeMemberConfirmText, type PrivateBookingPhase } from './privateBookingMenu'
import type { PrivateGroupMemberRow } from './privateGroupSummary'

const ROLE_LABEL: Record<PrivateGroupMemberRow['role'], string> = { organizer: '主催者', member: '会員', guest: 'ゲスト' }
const ROLE_BADGE: Record<PrivateGroupMemberRow['role'], string> = {
  organizer: 'bg-purple-100 text-purple-800 border-purple-200',
  member: 'bg-muted text-foreground border-border',
  guest: 'bg-amber-50 text-amber-800 border-amber-200',
}

function answerStatus(row: PrivateGroupMemberRow): string {
  if (row.total === 0) return '候補日なし'
  if (row.answered >= row.total) return '回答済み'
  if (row.answered === 0) return '未回答'
  return `${row.answered}/${row.total} 件回答`
}

interface PrivateGroupMemberSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: PrivateGroupMemberRow[]
  /** 自分の行（「外す」を出さない） */
  myMemberId: string | null
  phase: PrivateBookingPhase
  /** 外したあとに一覧を読み直す */
  onChanged: () => void | Promise<unknown>
}

export function PrivateGroupMemberSheet({ open, onOpenChange, members, myMemberId, phase, onChanged }: PrivateGroupMemberSheetProps) {
  const [target, setTarget] = useState<PrivateGroupMemberRow | null>(null)
  const confirm = target ? removeMemberConfirmText(target.name, phase) : null

  const remove = async () => {
    if (!target) return
    try {
      const { data, error } = await privateGroupRpcApi.removeMemberWithNotice(target.id)
      if (error) throw error
      const storeNotified = (data as { store_notified?: boolean } | null)?.store_notified === true
      toast.success(storeNotified ? `${target.name}さんを外しました。店舗に人数変更を知らせました` : `${target.name}さんを外しました`)
      await onChanged()
    } catch (err) {
      logger.error('メンバーを外せませんでした', err)
      toast.error(getErrorMessage(err) || 'メンバーを外せませんでした')
      throw err
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4 sm:mx-auto sm:max-w-lg rounded-t-lg" data-testid="member-sheet">
          <SheetHeader className="text-left">
            <SheetTitle>メンバーを管理</SheetTitle>
            <SheetDescription>参加中 {members.length} 名</SheetDescription>
          </SheetHeader>
          <ul className="mt-3 divide-y divide-border border border-border">
            {members.map(row => {
              const isMe = row.id === myMemberId
              return (
                <li key={row.id} className="flex items-start gap-3 p-3" data-testid="member-row">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0" aria-hidden="true">
                    <Users className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium truncate">{row.name}{isMe ? '（あなた）' : ''}</span>
                      <Badge variant="outline" className={ROLE_BADGE[row.role]}>{ROLE_LABEL[row.role]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      日程: {answerStatus(row)}
                      {row.joined_at ? ` ・ ${formatJstMonthDay(row.joined_at)} 参加` : ''}
                    </p>
                    {row.role === 'guest' && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">主催者になるにはアカウント登録が必要です</p>
                    )}
                  </div>
                  {!isMe && row.role !== 'organizer' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setTarget(row)}
                    >
                      外す
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={next => { if (!next) setTarget(null) }}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant="destructive"
        onConfirm={remove}
      />
    </>
  )
}
