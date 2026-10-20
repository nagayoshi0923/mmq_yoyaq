import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isPrivateGroupAccessLost, readPrivateGroup, type PrivateGroupSnapshot } from '@/lib/privateGroupRead'

export function usePrivateGroupSnapshot(groupId: string | null, inviteCode: string | null, memberId: string | null = null, pollMs = 15000) {
  const { user } = useAuth()
  const [snapshot, setSnapshot] = useState<PrivateGroupSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 一時的な通信失敗で直前の内容を表示し続けている間 true。次に読めたら false に戻る
  const [reconnecting, setReconnecting] = useState(false)
  const hasSnapshot = useRef(false)
  const generation = useRef(0)
  const pending = useRef<number | null>(null)
  const resolvedGroupId = useRef<string | null>(null)
  const refetch = useCallback(async (background = false): Promise<PrivateGroupSnapshot | null> => {
    // 遅い通信を定期取得が追い越し続け、結果が一度も表示されなくなるのを防ぐ。
    if (background && pending.current !== null) return null
    const request = ++generation.current
    if (!groupId && !inviteCode) {
      setSnapshot(null); setError(null); setReconnecting(false); setLoading(false)
      hasSnapshot.current = false
      return null
    }
    pending.current = request
    if (!background) setLoading(true)
    try {
      const next = await readPrivateGroup({ groupId: groupId || resolvedGroupId.current, inviteCode, memberId })
      if (request !== generation.current) return null
      resolvedGroupId.current = next.group.id
      hasSnapshot.current = true
      setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      setError(null); setReconnecting(false)
      return next
    } catch (e) {
      if (request !== generation.current) return null
      // 通信の切断・5xx・時間切れでは、直前の内容を残して次の定期取得で読み直す。
      // 画面を「見つかりません」に切り替えると、開いている申込シートの入力が消える（Codex 点検 不具合 3）
      if (hasSnapshot.current && !isPrivateGroupAccessLost(e)) {
        setReconnecting(true)
        return null
      }
      hasSnapshot.current = false
      setSnapshot(null); setReconnecting(false)
      setError(e instanceof Error ? e.message : 'グループを取得できませんでした')
      return null
    } finally {
      if (pending.current === request) pending.current = null
      if (request === generation.current) setLoading(false)
    }
  }, [groupId, inviteCode, memberId])
  const invalidate = useCallback(() => { generation.current++; pending.current = null }, [])
  useEffect(() => { resolvedGroupId.current = null }, [groupId, inviteCode])
  useEffect(() => {
    setSnapshot(null); setError(null); setReconnecting(false)
    hasSnapshot.current = false
    void refetch()
    return invalidate
  }, [refetch, invalidate, user?.id])
  // 直接テーブルの購読ではなく、毎回参加資格を確認して最新状態を取得する。
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void refetch(true) }
    const timer = window.setInterval(onFocus, pollMs)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refetch, pollMs])
  return {
    group: snapshot?.group || null, loading, error, reconnecting, refetch,
    linkedReservationStatus: snapshot?.linked_reservation_status || null,
    confirmedByName: snapshot?.confirmed_by_name || null,
    linkedReservation: snapshot?.linked_reservation || null,
    handover: snapshot?.handover || null,
    accessLevel: snapshot?.access_level || null,
  }
}
