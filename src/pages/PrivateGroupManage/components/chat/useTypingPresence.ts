/**
 * 「○○さんが入力中…」（グループページ刷新 段階 2）。Supabase Realtime の broadcast で送り合い、DB には書かない。
 * 送るのは参加者の id と表示名だけ（本文は送らない）。最後の合図から 3 秒で消える。
 *
 * 段階 3:
 * - チャンネル名はグループの id ではなく招待コードのハッシュ（groupChannelTopic）。
 * - チャットがいま見えている間は presence で { member_id, viewing: true } を出す。プッシュ通知の送信処理が
 *   「いま見ている人には送らない」の判定に使う（DB には書かない）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { groupChannelTopic } from '@/lib/groupChannelTopic'

const SHOW_MS = 3000
const SEND_INTERVAL_MS = 2000
/** 画面を離れてからチャンネルを外すまで（作り直しですぐ戻るときは使い回す） */
const RELEASE_DELAY_MS = 3000
/** 入るのを待つ時間。開いた直後は返事が来ないまま止まることがある（手元で確認）ので、短く待って入り直す */
const JOIN_TIMEOUT_MS = 3000

type TypingPayload = { memberId?: unknown; name?: unknown; stopped?: unknown }

/**
 * グループごとのチャンネルを画面をまたいで 1 つにする。supabase は同じ名前のチャンネルを使い回すため、
 * 外している途中に入り直すと何も届かなくなる（手元で確認）。外すのは少し待ってから。
 */
type Entry = {
  channel: RealtimeChannel | null; listeners: Set<(p: TypingPayload) => void>; refs: number; releaseTimer: number | null; lastSent: number; attempts: number
  memberId: string; subscribed: boolean
  /** いまチャットを見ている（画面が表に出ていて、チャットが見える）。presence に出す */
  viewing: boolean
}
const shared = new Map<string, Entry>()

/** 入る。つながらなかった（時間切れ等）ときは、外し終えてから少し待って入り直す（手元で時々時間切れになるため） */
function syncViewing(entry: Entry) {
  const channel = entry.channel
  if (!channel || !entry.subscribed) return
  if (entry.viewing) void channel.track({ member_id: entry.memberId, viewing: true })
  else void channel.untrack()
}

function connect(topic: string, entry: Entry) {
  const channel = supabase.channel(topic, { config: { broadcast: { self: false }, presence: { key: entry.memberId } } })
  entry.channel = channel
  entry.subscribed = false
  channel
    .on('broadcast', { event: 'typing' }, ({ payload }) => entry.listeners.forEach(fn => fn(payload as TypingPayload)))
    // presence を受け取る設定にしておく（送信処理が見に来たときに、ここで出した viewing が見える）
    .on('presence', { event: 'sync' }, () => undefined)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') { entry.attempts = 0; entry.subscribed = true; syncViewing(entry); return }
      if ((status !== 'TIMED_OUT' && status !== 'CHANNEL_ERROR') || entry.channel !== channel || shared.get(topic) !== entry) return
      entry.channel = null
      entry.subscribed = false
      entry.attempts++
      void supabase.removeChannel(channel).then(() => {
        if (shared.get(topic) !== entry || entry.attempts > 8) return
        window.setTimeout(() => { if (shared.get(topic) === entry && !entry.channel) connect(topic, entry) }, 500 * entry.attempts)
      })
    }, JOIN_TIMEOUT_MS)
}

function acquire(topic: string, memberId: string, listener: (p: TypingPayload) => void) {
  let entry = shared.get(topic)
  if (!entry) {
    entry = { channel: null, listeners: new Set(), refs: 0, releaseTimer: null, lastSent: 0, attempts: 0, memberId, subscribed: false, viewing: false }
    shared.set(topic, entry)
    connect(topic, entry)
  }
  if (entry.releaseTimer !== null) window.clearTimeout(entry.releaseTimer)
  entry.releaseTimer = null
  entry.refs++
  entry.listeners.add(listener)
  const current = entry
  return () => {
    current.listeners.delete(listener)
    current.refs--
    if (current.refs > 0) return
    current.releaseTimer = window.setTimeout(() => {
      shared.delete(topic)
      if (current.channel) void supabase.removeChannel(current.channel)
      current.channel = null
    }, RELEASE_DELAY_MS)
  }
}

/** 画面が表に出ているか（別のタブ・アプリに切り替えたら false） */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * channelKey: 招待コード（チャンネル名のもと）。chatVisible: チャットがいま見えているか（スマホはチャットタブ、PC は右列）
 */
export function useTypingPresence(channelKey: string, memberId: string | null, myName: string, enabled: boolean, chatVisible = true) {
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({})
  const [topic, setTopic] = useState<string | null>(null)
  const pageVisible = usePageVisible()

  useEffect(() => {
    let cancelled = false
    setTopic(null)
    if (!channelKey) return
    void groupChannelTopic(channelKey).then(t => { if (!cancelled) setTopic(t) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [channelKey])

  useEffect(() => {
    if (!enabled || !topic || !memberId) return
    const release = acquire(topic, memberId, p => {
      if (typeof p.memberId !== 'string' || p.memberId === memberId) return
      const id = p.memberId
      const name = typeof p.name === 'string' ? p.name.slice(0, 40) : 'メンバー'
      setTyping(prev => {
        const next = { ...prev }
        if (p.stopped) delete next[id]
        else next[id] = { name, until: Date.now() + SHOW_MS }
        return next
      })
    })
    const timer = window.setInterval(() => {
      setTyping(prev => {
        const now = Date.now()
        const alive = Object.entries(prev).filter(([, v]) => v.until > now)
        return alive.length === Object.keys(prev).length ? prev : Object.fromEntries(alive)
      })
    }, 1000)
    return () => {
      window.clearInterval(timer)
      release()
      setTyping({})
    }
  }, [topic, memberId, enabled])

  // いま見ているか（presence）。画面が裏に回った・別のタブを見ているときは外す（その間はプッシュが届く）
  const viewing = enabled && chatVisible && pageVisible
  useEffect(() => {
    if (!topic || !memberId || !enabled) return
    const entry = shared.get(topic)
    if (!entry) return
    entry.viewing = viewing
    syncViewing(entry)
  }, [topic, memberId, enabled, viewing])

  const send = useCallback((stopped: boolean) => {
    if (!topic) return
    const entry = shared.get(topic)
    if (!entry?.channel || !memberId) return
    const now = Date.now()
    if (!stopped && now - entry.lastSent < SEND_INTERVAL_MS) return
    entry.lastSent = stopped ? 0 : now
    void entry.channel.send({ type: 'broadcast', event: 'typing', payload: { memberId, name: myName, ...(stopped ? { stopped: true } : {}) } })
  }, [topic, memberId, myName])

  /** 入力したら呼ぶ（2 秒に 1 回だけ送る） */
  const notifyTyping = useCallback(() => send(false), [send])
  /** 送信したら呼ぶ（相手の表示をすぐ消す） */
  const notifyStopped = useCallback(() => send(true), [send])

  const names = Object.values(typing).map(v => v.name)
  return { typingNames: names, notifyTyping, notifyStopped }
}
