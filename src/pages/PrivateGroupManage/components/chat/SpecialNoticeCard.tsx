/**
 * チャットの中で行動や確認が要るお知らせのカード（個別のお知らせ・配役方法・配役の確定）。
 * GroupChat.tsx から規則を変えずに切り出した（グループページ刷新 段階 2）。
 */
import type { MutableRefObject } from 'react'
import { CheckCircle2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sentry } from '@/lib/sentry'
import type { PrivateGroupMember, PrivateGroupMessage } from '@/types'
import type { SystemMessage } from '../groupChatMessages'
import { renderMessageWithLinks } from '../renderMessageWithLinks'

export const SPECIAL_NOTICE_ACTIONS = new Set(['individual_notice', 'character_method_selected', 'character_assignment'])

interface SpecialNoticeCardProps {
  msg: PrivateGroupMessage
  systemMsg: SystemMessage
  groupId: string
  currentMemberId: string | null
  effectiveMemberId: string | null | undefined
  memberIdFromUser: string | null | undefined
  userId: string | null
  members: PrivateGroupMember[]
  closedHandoverIds: Set<string>
  charAssignmentMethod?: string | null
  formatDateTime: (dateStr: string) => string
  onOpenHandover?: (requestId: string) => void
  /** 個別お知らせのフォールバック表示の診断ログを 1 回だけ送るための印（#278。チャット全体で 1 つ） */
  noticeFallbackLoggedRef: MutableRefObject<boolean>
}

export function SpecialNoticeCard(props: SpecialNoticeCardProps) {
  const { msg, systemMsg, groupId, currentMemberId, effectiveMemberId, memberIdFromUser, userId, members, closedHandoverIds, charAssignmentMethod, formatDateTime, onOpenHandover, noticeFallbackLoggedRef } = props
  const user = userId ? { id: userId } : null
  // システムメッセージ（個別お知らせ）- 対象者本人のみに表示
  if (systemMsg && systemMsg.action === 'individual_notice') {
    // 対象本人か判定（#275/#278）:
    // - member_id 一致（prop の currentMemberId が未解決でも user_id から引き直した effectiveMemberId で補完）
    // - または通知に埋め込まれた target_user_id とログインユーザーの一致（メンバー行の再作成後も届く）
    const isTargetByMember = !!effectiveMemberId && systemMsg.target_member_id === effectiveMemberId
    const isTargetByUser = !!user && !!systemMsg.target_user_id && systemMsg.target_user_id === user.id
    if (!isTargetByMember && !isTargetByUser) {
      return null
    }
    // 診断: currentMemberId prop では不一致だがフォールバックで表示できた場合を記録（#278）
    if (systemMsg.target_member_id !== currentMemberId && !noticeFallbackLoggedRef.current) {
      noticeFallbackLoggedRef.current = true
      Sentry.captureMessage('individual_notice: currentMemberId未解決のためフォールバック表示', {
        level: 'warning',
        tags: { feature: 'group-chat' },
        extra: { groupId, currentMemberId, memberIdFromUser, hasUser: !!user },
      })
    }
    const currentMember = members.find(m => m.id === effectiveMemberId)
    const nickname = currentMember?.guest_name || 'あなた'
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <div>
              <p className="text-sm font-medium text-indigo-800">
                {systemMsg.handover_request_id && systemMsg.title ? systemMsg.title : `${nickname}さんへのお知らせ`}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 mt-2 border border-indigo-100 overflow-hidden">
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-all">
              {renderMessageWithLinks(systemMsg.message || '')}
            </p>
            {systemMsg.handover_request_id && (
              closedHandoverIds.has(systemMsg.handover_request_id) ? (
                <p className="text-xs text-muted-foreground mt-2">この依頼は終わっています</p>
              ) : onOpenHandover ? (
                <Button type="button" size="sm" className="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => onOpenHandover(systemMsg.handover_request_id!)} data-testid="handover-open">
                  確認する
                </Button>
              ) : null
            )}
          </div>
          <p className="text-xs text-indigo-400 mt-2 text-center">
            🔒 このお知らせはあなただけに表示されています
          </p>
        </div>
      </div>
    )
  }

  // 配役方法選択
  if (systemMsg && systemMsg.action === 'character_method_selected') {
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-800">
                {systemMsg.title || '配役方法が選択されました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {systemMsg.body}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // キャラクター配役確定（方法がリセットされている場合は非表示）
  if (systemMsg && systemMsg.action === 'character_assignment') {
    if (!charAssignmentMethod) return null
    return (
      <div key={msg.id} className="flex justify-center my-4">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-800">
                {systemMsg.title || 'キャラクター配役が確定しました'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(msg.created_at)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {systemMsg.body}
            </p>
          </div>
        </div>
      </div>
    )
  }
  return null
}
