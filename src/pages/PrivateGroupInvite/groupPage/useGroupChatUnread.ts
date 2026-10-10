/**
 * チャットの未読数（タブの赤丸）。最後にチャットを見た時刻をこの端末に覚えておき、それより新しい自分以外の発言・お知らせを数える。
 * 端末をまたいだ既読の同期は段階 3（プッシュ通知）で扱う。
 */
import { useEffect, useState } from 'react'
import type { PrivateGroupMessage } from '@/types'
import { countUnread } from './groupPageModel'

const keyOf = (groupId: string) => `mmq_group_chat_seen_${groupId}`

function readSeen(groupId: string): string | null {
  try {
    return window.localStorage.getItem(keyOf(groupId))
  } catch {
    return null
  }
}

function writeSeen(groupId: string, value: string) {
  try {
    window.localStorage.setItem(keyOf(groupId), value)
  } catch {
    // 保存できない端末では毎回 0 から数える
  }
}

export function useGroupChatUnread(groupId: string | null, myMemberId: string | null, messages: PrivateGroupMessage[], loading: boolean, chatVisible: boolean): number {
  const [lastSeen, setLastSeen] = useState<string | null>(() => (groupId ? readSeen(groupId) : null))
  useEffect(() => {
    setLastSeen(groupId ? readSeen(groupId) : null)
  }, [groupId])
  useEffect(() => {
    if (!groupId || loading) return
    // 見ている間、または初めて開いたときは、いま届いている分まで見たことにする
    if (!chatVisible && lastSeen !== null) return
    const latest = messages.length > 0 ? messages[messages.length - 1].created_at : new Date().toISOString()
    if (lastSeen !== null && new Date(latest).getTime() <= new Date(lastSeen).getTime()) return
    writeSeen(groupId, latest)
    setLastSeen(latest)
  }, [groupId, messages, loading, chatVisible, lastSeen])
  return chatVisible ? 0 : countUnread(messages, myMemberId, lastSeen)
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
