import { fetchPlayedReservations, resolvePlayedScenarioIds } from '@/lib/playedStatus'
import { customerPlayHistory } from '@/lib/customerPlayHistory'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPlayedScenarios = useCallback(async () => {
    if (!user?.email) {
      setPlayedScenarioIds(new Set())
      setCustomerId(null)
      setLoading(false)
      return
    }

    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (!customer) {
        setPlayedScenarioIds(new Set())
        setCustomerId(null)
        setLoading(false)
        return
      }

      setCustomerId(customer.id)
      const [reservations, history] = await Promise.all([
        fetchPlayedReservations(customer.id),
        customerPlayHistory.snapshot(customer.id),
      ])
      const scenarioIds = resolvePlayedScenarioIds(reservations, history.manual, history.overrides)

      setPlayedScenarioIds(scenarioIds)
    } catch (error) {
      logger.error('体験済みシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    fetchPlayedScenarios()
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
    markAsPlayed,
    unmarkAsPlayed,
    refreshPlayed: fetchPlayedScenarios,
    playedScenarioIds,
    loading,
  }
}
