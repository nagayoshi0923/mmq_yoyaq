/**
 * チャットの未読数（タブの赤丸）と既読の書き込み（グループページ刷新 段階 2）。
 * 「最後に読んだ時刻」はグループごとに DB に 1 行（private_group_read_states）。スマホと PC で既読がそろう。
 * チャットが見えている間（スマホはチャットタブ、PC は右列）に新しい発言が届いたら、その時刻まで読んだことにする（連打抑制は usePrivateGroupChatState）。
 */
import { useEffect, useMemo, useState } from 'react'
import type { PrivateGroup, PrivateGroupMessage } from '@/types'
import type { PrivateGroupChatState } from '@/hooks/usePrivateGroupChatState'
import { noticeLineResolver } from '@/pages/PrivateGroupManage/components/groupChatMessages'
import { countUnread } from './groupPageModel'

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

export function useGroupChatUnread(myMemberId: string | null, messages: PrivateGroupMessage[], loading: boolean, chat: PrivateGroupChatState, chatVisible: boolean, group?: Pick<PrivateGroup, 'candidate_dates' | 'status'> | null, userId: string | null = null): number {
  const pageVisible = usePageVisible()
  const lastRead = chat.state.my_last_read_at
  const latest = messages.length > 0 ? messages[messages.length - 1].created_at : null
  const { markRead, loaded } = chat
  useEffect(() => {
    if (loading || !loaded) return
    // 初めて開いた（まだ記録が無い）ときは、いま届いている分まで読んだことにする
    if (!lastRead) {
      markRead(latest ?? new Date().toISOString())
      return
    }
    if (!chatVisible || !pageVisible || !latest) return
    if (new Date(latest).getTime() > new Date(lastRead).getTime()) markRead(latest)
  }, [loading, loaded, lastRead, latest, chatVisible, pageVisible, markRead])
  // 自動のお知らせはすべて灰色の 1 行。そのうち店舗からの返事・自分に行動が要るもの（notable）だけ数える
  // （参加した・回答済みの候補日の追加などは数えない。チャットと同じ見分け方。名前は使わない）
  const isLine = useMemo(() => {
    const lineOf = noticeLineResolver({ getMemberName: () => '', current: group?.candidate_dates ?? null, status: group?.status, myMemberId, userId })
    return (m: PrivateGroupMessage) => {
      if (m.deleted_at) return false
      const line = lineOf(m)
      return line !== null && (line.hidden || !line.notable)
    }
  }, [group?.candidate_dates, group?.status, myMemberId, userId])
  return chatVisible ? 0 : countUnread(messages, myMemberId, lastRead, isLine)
}

/** PC 幅（lg = 1024px 以上）か。PC ではチャットが右列に常に見えるので既読にする */
export function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)'
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setDesktop(mql.matches)
    onChange()
    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [])
  return desktop
}
