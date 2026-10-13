/**
 * チャットの既読・リアクション（グループページ刷新 段階 2）。メッセージと同じく 5 秒ごと・画面に戻ったときに読む。
 * 既読の書き込みは連打しない（markRead は 3 秒に 1 回まで、すでに読んだ時刻より新しいときだけ）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@/utils/logger'
import { privateGroupChatAction, readPrivateGroupChatState, type ChatStateSnapshot } from '@/lib/privateGroupChat'
import { applyMyReaction } from '@/pages/PrivateGroupManage/components/chat/chatModel'

const EMPTY: ChatStateSnapshot = { my_last_read_at: null, read_times: [], reactions: [] }
const READ_THROTTLE_MS = 3000

export interface PrivateGroupChatState {
  state: ChatStateSnapshot
  loaded: boolean
  refetch: () => Promise<void>
  /** at（届いた最新の発言の時刻）まで読んだことにする */
  markRead: (at: string) => void
  /** リアクションを押す（見た目は先に変える） */
  react: (messageId: string, emoji: string) => Promise<void>
}

export function usePrivateGroupChatState(groupId: string, memberId: string | null, options: { enabled?: boolean } = {}): PrivateGroupChatState {
  const enabled = (options.enabled ?? true) && Boolean(groupId && memberId)
  const [state, setState] = useState<ChatStateSnapshot>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const generation = useRef(0)
  const lastReadSent = useRef<{ at: number; value: number }>({ at: 0, value: 0 })
  const pendingRead = useRef<number | null>(null)

  const refetch = useCallback(async () => {
    if (!enabled || !memberId) return
    const request = ++generation.current
    try {
      const next = await readPrivateGroupChatState(groupId, memberId)
      if (request !== generation.current) return
      setState(prev => {
        // 自分の既読は書き込んだ値より古く戻さない（読み取りと書き込みの行き違い）
        const mine = prev.my_last_read_at && next.my_last_read_at && new Date(prev.my_last_read_at) > new Date(next.my_last_read_at) ? prev.my_last_read_at : next.my_last_read_at
        const merged = { ...next, my_last_read_at: mine }
        return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged
      })
    } catch (err) {
      logger.error('チャットの既読・リアクションを読めませんでした', err)
    } finally {
      if (request === generation.current) setLoaded(true)
    }
  }, [groupId, memberId, enabled])

  useEffect(() => {
    setState(EMPTY)
    setLoaded(false)
    lastReadSent.current = { at: 0, value: 0 }
    if (!enabled) return
    void refetch()
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refetch() }
    const timer = window.setInterval(refreshVisible, 5000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const gen = generation
    return () => {
      gen.current++
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refetch, enabled])

  const sendRead = useCallback((value: number) => {
    if (!memberId) return
    lastReadSent.current = { at: Date.now(), value }
    void privateGroupChatAction(groupId, memberId, 'read', { at: new Date(value).toISOString() })
      .catch(err => logger.error('既読を保存できませんでした', err))
  }, [groupId, memberId])

  const markRead = useCallback((at: string) => {
    if (!enabled) return
    const value = new Date(at).getTime()
    if (!Number.isFinite(value)) return
    setState(prev => (prev.my_last_read_at && new Date(prev.my_last_read_at).getTime() >= value ? prev : { ...prev, my_last_read_at: new Date(value).toISOString() }))
    if (value <= lastReadSent.current.value) return
    const wait = lastReadSent.current.at + READ_THROTTLE_MS - Date.now()
    if (wait <= 0) {
      sendRead(value)
      return
    }
    if (pendingRead.current !== null) window.clearTimeout(pendingRead.current)
    pendingRead.current = window.setTimeout(() => {
      pendingRead.current = null
      sendRead(Math.max(value, lastReadSent.current.value))
    }, wait)
  }, [enabled, sendRead])

  useEffect(() => () => { if (pendingRead.current !== null) window.clearTimeout(pendingRead.current) }, [])

  const react = useCallback(async (messageId: string, emoji: string) => {
    if (!memberId) return
    generation.current++
    setState(prev => ({ ...prev, reactions: applyMyReaction(prev.reactions, messageId, emoji) }))
    try {
      await privateGroupChatAction(groupId, memberId, 'react', { message_id: messageId, emoji })
    } finally {
      await refetch()
    }
  }, [groupId, memberId, refetch])

  return { state, loaded, refetch, markRead, react }
}
