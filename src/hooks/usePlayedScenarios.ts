import { fetchPlayedReservations, resolvePlayedScenarioIds } from '@/lib/playedStatus'
import { snapshotAllCustomers } from '@/lib/ownPlayHistory'
import { PLAY_HISTORY_CHANGED_EVENT } from '@/lib/playHistoryEvents'
import { useState, useEffect, useCallback, useRef } from 'react'
import { customerLookupReadApi } from '@/lib/api/customerHookReadApi'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { addPlayedOverride } from '@/lib/playedOverrides'

/**
 * ユーザーの体験済みシナリオIDを管理するフック
 * DB (reservations + manual_play_history) から取得（読み取り専用）
 * customer_played_overrides（本人/スタッフが解除したシナリオ）は差し引く
 * 登録は PlayedRegistrationDialog 経由で行い、refreshPlayed で再取得
 */
export function usePlayedScenarios() {
  const { user } = useAuth()
  const [playedScenarioIds, setPlayedScenarioIds] = useState<Set<string>>(new Set())
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)

  const fetchPlayedScenarios = useCallback(async () => {
    const request = ++generation.current
    const active = () => request === generation.current
    if (!user?.id) {
      setPlayedScenarioIds(new Set())
      setCustomerId(null)
      setCustomerIds([])
      setLoading(false)
      return
    }

    try {
      const { data: customers, error: lookupError } = await customerLookupReadApi.listIdsByUserId(user.id)
      if (lookupError) throw lookupError
      if (!active()) return
      const customer = customers?.[0]

      if (!customer) {
        setPlayedScenarioIds(new Set())
        setCustomerId(null)
        setCustomerIds([])
        setLoading(false)
        return
      }

      setCustomerId(customer.id)
      setCustomerIds(customers!.map(row => row.id))
      const history = await snapshotAllCustomers(customers!.map(row => row.id))
      if (!active()) return
      // 手動履歴・未体験指定は確認済み。予約取得が失敗してもこの判定は保持する。
      setPlayedScenarioIds(resolvePlayedScenarioIds([], history.manual, history.overrides))
      const reservations = (await Promise.all(customers!.map(row => fetchPlayedReservations(row.id)))).flat()
      const scenarioIds = resolvePlayedScenarioIds(reservations, history.manual, history.overrides)

      if (active()) setPlayedScenarioIds(scenarioIds)
    } catch (error) {
      if (active()) logger.error('体験済みシナリオ取得エラー:', error)
    } finally {
      if (active()) setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    // 認証主体が変わった時は前の本人の情報を即座に破棄する。更新イベントでは保持する。
    setPlayedScenarioIds(new Set())
    setCustomerId(null)
    setCustomerIds([])
    setLoading(true)
    void fetchPlayedScenarios()
    const refresh = () => { void fetchPlayedScenarios() }
    window.addEventListener(PLAY_HISTORY_CHANGED_EVENT, refresh)
    return () => { generation.current++; window.removeEventListener(PLAY_HISTORY_CHANGED_EVENT, refresh) }
  }, [fetchPlayedScenarios])

  const isPlayed = useCallback((scenarioId: string): boolean => {
    return playedScenarioIds.has(scenarioId)
  }, [playedScenarioIds])

  const markAsPlayed = useCallback((scenarioMasterId: string) => {
    setPlayedScenarioIds(prev => new Set([...prev, scenarioMasterId]))
  }, [])

  const unmarkAsPlayed = useCallback(async (scenarioMasterId: string): Promise<void> => {
    if (!customerId) {
      throw new Error('顧客情報が見つかりません')
    }

    setPlayedScenarioIds(prev => {
      const next = new Set(prev)
      next.delete(scenarioMasterId)
      return next
    })

    try {
      await addPlayedOverride(customerId, scenarioMasterId)
    } catch (error) {
      setPlayedScenarioIds(prev => new Set([...prev, scenarioMasterId]))
      throw error
    }
  }, [customerId])

  return {
    isPlayed,
    customerId,
    customerIds,
    markAsPlayed,
    unmarkAsPlayed,
    refreshPlayed: fetchPlayedScenarios,
    playedScenarioIds,
    loading,
  }
}
