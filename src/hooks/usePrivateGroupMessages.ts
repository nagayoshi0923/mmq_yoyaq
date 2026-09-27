import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { readPrivateGroupMessages } from '@/lib/privateGroupRead'
import type { PrivateGroupMessage } from '@/types'

/** チャットは参加資格を確認するRPCだけで読み、認証変更時は古い内容を破棄する。 */
export function usePrivateGroupMessages(groupId: string, memberId: string | null) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<PrivateGroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  const refetch = useCallback(async () => {
    const request = ++generation.current
    try {
      const next = await readPrivateGroupMessages(groupId, memberId)
      if (request !== generation.current) return
      setMessages(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      setError(false)
    } catch {
      if (request !== generation.current) return
      setMessages([])
      setError(true)
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [groupId, memberId])
  const invalidate = useCallback(() => { generation.current++ }, [])
  useEffect(() => {
    setMessages([])
    setLoading(true)
    setError(false)
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try { await refetch() } finally { pending = false }
    }
    void refresh()
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = window.setInterval(refreshVisible, 5000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      invalidate()
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refetch, invalidate, user?.id])
  return { messages, loading, error, refetch }
}
