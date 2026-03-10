import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

/**
 * ユーザーの体験済みシナリオIDを管理するフック
 */
export function usePlayedScenarios() {
  const { user } = useAuth()
  const [playedScenarioIds, setPlayedScenarioIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPlayedScenarios = async () => {
      if (!user?.email) {
        setPlayedScenarioIds(new Set())
        setLoading(false)
        return
      }

      try {
        // 顧客IDを取得
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()

        if (!customer) {
          setPlayedScenarioIds(new Set())
          setLoading(false)
          return
        }

        const scenarioIds = new Set<string>()

        // 予約から体験済みシナリオを取得
        const { data: reservations } = await supabase
          .from('reservations')
          .select('scenario_master_id')
          .eq('customer_id', customer.id)
          .in('status', ['confirmed', 'gm_confirmed'])
          .lte('requested_datetime', new Date().toISOString())

        reservations?.forEach(r => {
          if (r.scenario_master_id) {
            scenarioIds.add(r.scenario_master_id)
          }
        })

        // 手動登録から体験済みシナリオを取得
        const { data: manualHistory } = await supabase
          .from('manual_play_history')
          .select('scenario_master_id')
          .eq('customer_id', customer.id)

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
    }

    fetchPlayedScenarios()
  }, [user])

  const isPlayed = (scenarioId: string): boolean => {
    return playedScenarioIds.has(scenarioId)
  }

  return { isPlayed, playedScenarioIds, loading }
}
