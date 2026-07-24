import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { fetchPlayedOverrideIds, addPlayedOverride } from '@/lib/playedOverrides'

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
      const scenarioIds = new Set<string>()

      const { data: reservations } = await supabase
        .from('reservations')
        .select('scenario_master_id')
        .eq('customer_id', customer.id)
        .not('status', 'in', '("cancelled","no_show")')
        .lte('requested_datetime', new Date().toISOString())

      reservations?.forEach(r => {
        if (r.scenario_master_id) {
          scenarioIds.add(r.scenario_master_id)
        }
      })

      const { data: manualHistory } = await supabase
        .from('manual_play_history')
        .select('scenario_master_id')
        .eq('customer_id', customer.id)
        .limit(MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER)

      manualHistory?.forEach(m => {
        if (m.scenario_master_id) {
          scenarioIds.add(m.scenario_master_id)
        }
      })

      // 本人/スタッフが「未体験に戻した」シナリオを差し引く（表示判定専用の override）
      const overrideIds = await fetchPlayedOverrideIds(customer.id)
      overrideIds.forEach(id => scenarioIds.delete(id))

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

  /**
   * 体験済みを解除（未体験に戻す）。override を追加し、ローカル状態も更新する。
   * customerId が無い場合は throw（呼び出し側で toast）。
   */
  const unmarkAsPlayed = useCallback(async (scenarioMasterId: string): Promise<void> => {
    if (!customerId) {
      throw new Error('顧客情報が見つかりません')
    }
    // optimistic: 先にローカルから外し、失敗時は戻す
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

  return { isPlayed, customerId, markAsPlayed, unmarkAsPlayed, refreshPlayed: fetchPlayedScenarios, playedScenarioIds, loading }
}
