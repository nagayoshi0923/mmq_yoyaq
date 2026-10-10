/**
 * チャットの未読数（タブの赤丸）と既読の書き込み（グループページ刷新 段階 2）。
 * 「最後に読んだ時刻」はグループごとに DB に 1 行（private_group_read_states）。スマホと PC で既読がそろう。
 * チャットが見えている間（スマホはチャットタブ、PC は右列）に新しい発言が届いたら、その時刻まで読んだことにする（連打抑制は usePrivateGroupChatState）。
 */
import { useEffect, useState } from 'react'
import type { PrivateGroupMessage } from '@/types'
import type { PrivateGroupChatState } from '@/hooks/usePrivateGroupChatState'
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

export function useGroupChatUnread(myMemberId: string | null, messages: PrivateGroupMessage[], loading: boolean, chat: PrivateGroupChatState, chatVisible: boolean): number {
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
  return chatVisible ? 0 : countUnread(messages, myMemberId, lastRead)
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
