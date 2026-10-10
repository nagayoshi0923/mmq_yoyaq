/**
 * 「○○さんが入力中…」（グループページ刷新 段階 2）。Supabase Realtime の broadcast で送り合い、DB には書かない。
 * 送るのは参加者の id と表示名だけ（本文は送らない）。最後の合図から 3 秒で消える。
 */
import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
type Entry = { channel: RealtimeChannel | null; listeners: Set<(p: TypingPayload) => void>; refs: number; releaseTimer: number | null; lastSent: number; attempts: number }
const shared = new Map<string, Entry>()

/** 入る。つながらなかった（時間切れ等）ときは、外し終えてから少し待って入り直す（手元で時々時間切れになるため） */
function connect(topic: string, entry: Entry) {
  const channel = supabase.channel(topic, { config: { broadcast: { self: false } } })
  entry.channel = channel
  channel
    .on('broadcast', { event: 'typing' }, ({ payload }) => entry.listeners.forEach(fn => fn(payload as TypingPayload)))
    .subscribe(status => {
      if (status === 'SUBSCRIBED') { entry.attempts = 0; return }
      if ((status !== 'TIMED_OUT' && status !== 'CHANNEL_ERROR') || entry.channel !== channel || shared.get(topic) !== entry) return
      entry.channel = null
      entry.attempts++
      void supabase.removeChannel(channel).then(() => {
        if (shared.get(topic) !== entry || entry.attempts > 8) return
        window.setTimeout(() => { if (shared.get(topic) === entry && !entry.channel) connect(topic, entry) }, 500 * entry.attempts)
      })
    }, JOIN_TIMEOUT_MS)
}

function acquire(topic: string, listener: (p: TypingPayload) => void) {
  let entry = shared.get(topic)
  if (!entry) {
    entry = { channel: null, listeners: new Set(), refs: 0, releaseTimer: null, lastSent: 0, attempts: 0 }
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

export function useTypingPresence(groupId: string, memberId: string | null, myName: string, enabled: boolean) {
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({})
  const topic = `private-group-typing:${groupId}`

  useEffect(() => {
    if (!enabled || !groupId || !memberId) return
    const release = acquire(topic, p => {
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
  }, [topic, groupId, memberId, enabled])

  const send = useCallback((stopped: boolean) => {
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
