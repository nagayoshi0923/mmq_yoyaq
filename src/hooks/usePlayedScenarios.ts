import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'

/**
 * ユーザーの体験済みシナリオIDを管理するフック
 * DB (reservations + manual_play_history) から取得（読み取り専用）
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

  return { isPlayed, customerId, markAsPlayed, refreshPlayed: fetchPlayedScenarios, playedScenarioIds, loading }
}
