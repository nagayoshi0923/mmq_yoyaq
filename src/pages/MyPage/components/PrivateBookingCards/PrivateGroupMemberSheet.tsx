/**
 * メンバー管理ダイアログ（「操作」メニューの「メンバーを管理」）。マイページ・グループ画面で共通。
 * 画面中央に出す（以前の下端シートは PC で下に張り付いて中身が切れたため、問い合わせダイアログと同じ形にした）。
 * 一覧: 名前・立場（主催者／会員／ゲスト）・日程回答の状況・参加日。各行に「外す」（自分の行には出さない）。
 * 外すときはチャットに記録し、申込済み・確定後は店舗へ人数変更として知らせる（private_group_remove_member_with_notice）。
 * 会員（アカウントあり）の行には「主催者にする」（段階 3: 主催者の引き継ぎを依頼。相手の同意で成立。同時 1 件まで）。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/patterns/modal'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { getErrorMessage } from '@/lib/errorFields'
import { formatJstMonthDay } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import { removeMemberConfirmText, type PrivateBookingPhase } from './privateBookingMenu'
import type { PrivateGroupMemberRow } from './privateGroupSummary'
import { canRequestHandoverTo, formatHandoverDeadline, handoverRequestConfirmText, type PrivateGroupHandoverInfo } from './privateGroupHandover'

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
  groupId: string
  members: PrivateGroupMemberRow[]
  /** 自分の行（「外す」を出さない） */
  myMemberId: string | null
  phase: PrivateBookingPhase
  /** 依頼中の主催者の引き継ぎ（あれば「主催者にする」は出さず、宛先の行に「同意待ち」を出す） */
  handover: PrivateGroupHandoverInfo | null
  /** 外した・引き継ぎを依頼したあとに一覧を読み直す */
  onChanged: () => void | Promise<unknown>
}

export function PrivateGroupMemberSheet({ open, onOpenChange, groupId, members, myMemberId, phase, handover, onChanged }: PrivateGroupMemberSheetProps) {
  const [target, setTarget] = useState<PrivateGroupMemberRow | null>(null)
  const [handoverTarget, setHandoverTarget] = useState<PrivateGroupMemberRow | null>(null)
  const confirm = target ? removeMemberConfirmText(target.name, phase) : null
  const handoverConfirm = handoverTarget ? handoverRequestConfirmText(handoverTarget.name) : null

  const requestHandover = async () => {
    if (!handoverTarget) return
    try {
      const { error } = await privateGroupRpcApi.requestHandover(groupId, handoverTarget.id)
      if (error) throw error
      toast.success(`${handoverTarget.name}さんに主催者の引き継ぎを依頼しました`)
      await onChanged()
    } catch (err) {
      logger.error('主催者の引き継ぎを依頼できませんでした', err)
      toast.error(getErrorMessage(err) || '主催者の引き継ぎを依頼できませんでした')
      throw err
    }
  }

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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] sm:max-h-[85vh] overflow-y-auto" data-testid="member-sheet">
          <DialogHeader className="text-left pr-6">
            <DialogTitle>メンバーを管理</DialogTitle>
            <DialogDescription>参加中 {members.length} 名</DialogDescription>
          </DialogHeader>
          {handover && (
            <p className="mt-3 p-2 bg-purple-50 border border-purple-200 text-xs text-purple-900 leading-snug" data-testid="handover-pending-note">
              {handover.toName}さんに主催者の引き継ぎを依頼中です（期限 {formatHandoverDeadline(handover.expiresAt)}）。同意されるまであなたが主催者です。取り消すときは「操作」の「引き継ぎの依頼を取り消す」から。
            </p>
          )}
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
                    {handover && handover.toMemberId === row.id && (
                      <p className="text-xs text-purple-700 mt-0.5" data-testid="handover-waiting">主催者の引き継ぎの同意待ち</p>
                    )}
                  </div>
                  {!isMe && row.role !== 'organizer' && (
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {canRequestHandoverTo(row, myMemberId, handover) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-purple-300 text-purple-700 hover:bg-purple-50"
                          onClick={() => setHandoverTarget(row)}
                          data-testid="make-organizer"
                        >
                          主催者にする
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setTarget(row)}
                      >
                        外す
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={next => { if (!next) setTarget(null) }}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant="destructive"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={handoverTarget !== null}
        onOpenChange={next => { if (!next) setHandoverTarget(null) }}
        title={handoverConfirm?.title ?? ''}
        message={handoverConfirm?.message}
        confirmLabel={handoverConfirm?.confirmLabel}
        onConfirm={requestHandover}
      />
    </>
  )
}
