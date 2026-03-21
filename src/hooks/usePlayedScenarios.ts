import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

const PLAYED_KEY = 'played_scenarios'

/**
 * ユーザーの体験済みシナリオIDを管理するフック
 * ログイン時: DB (reservations + manual_play_history) から取得、トグル可能
 * 非ログイン時: localStorage で管理
 */
export function usePlayedScenarios() {
  const { user } = useAuth()
  const [playedScenarioIds, setPlayedScenarioIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(PLAYED_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [manualPlayedIds, setManualPlayedIds] = useState<Set<string>>(new Set())
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPlayedScenarios = async () => {
      if (!user?.email) {
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
          setCustomerId(null)
          setLoading(false)
          return
        }

        setCustomerId(customer.id)
        const scenarioIds = new Set<string>()
        const manualIds = new Set<string>()

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

        const { data: manualHistory } = await supabase
          .from('manual_play_history')
          .select('scenario_master_id')
          .eq('customer_id', customer.id)

        manualHistory?.forEach(m => {
          if (m.scenario_master_id) {
            scenarioIds.add(m.scenario_master_id)
            manualIds.add(m.scenario_master_id)
          }
        })

        setPlayedScenarioIds(scenarioIds)
        setManualPlayedIds(manualIds)
        localStorage.setItem(PLAYED_KEY, JSON.stringify(Array.from(scenarioIds)))
      } catch (error) {
        logger.error('体験済みシナリオ取得エラー:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPlayedScenarios()
  }, [user])

  useEffect(() => {
    if (!customerId) {
      try {
        localStorage.setItem(PLAYED_KEY, JSON.stringify(Array.from(playedScenarioIds)))
      } catch (error) {
        logger.error('Failed to save played scenarios:', error)
      }
    }
  }, [playedScenarioIds, customerId])

  const togglePlayed = useCallback(async (scenarioMasterId: string, scenarioTitle: string) => {
    const isCurrentlyPlayed = playedScenarioIds.has(scenarioMasterId)
    const isManual = manualPlayedIds.has(scenarioMasterId)

    // 楽観的更新
    setPlayedScenarioIds(prev => {
      const next = new Set(prev)
      if (isCurrentlyPlayed && isManual) {
        next.delete(scenarioMasterId)
      } else if (!isCurrentlyPlayed) {
        next.add(scenarioMasterId)
      }
      return next
    })
    setManualPlayedIds(prev => {
      const next = new Set(prev)
      if (isManual) {
        next.delete(scenarioMasterId)
      } else {
        next.add(scenarioMasterId)
      }
      return next
    })

    if (customerId) {
      try {
        if (isManual) {
          const { error } = await supabase
            .from('manual_play_history')
            .delete()
            .eq('customer_id', customerId)
            .eq('scenario_master_id', scenarioMasterId)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('manual_play_history')
            .insert({
              customer_id: customerId,
              scenario_master_id: scenarioMasterId,
              scenario_title: scenarioTitle,
            })
          if (error) throw error
        }
      } catch (error) {
        logger.error('体験済みトグルエラー:', error)
        // ロールバック
        setPlayedScenarioIds(prev => {
          const next = new Set(prev)
          if (isCurrentlyPlayed) next.add(scenarioMasterId)
          else next.delete(scenarioMasterId)
          return next
        })
        setManualPlayedIds(prev => {
          const next = new Set(prev)
          if (isManual) next.add(scenarioMasterId)
          else next.delete(scenarioMasterId)
          return next
        })
      }
    }
  }, [playedScenarioIds, manualPlayedIds, customerId])

  const isPlayed = useCallback((scenarioId: string): boolean => {
    return playedScenarioIds.has(scenarioId)
  }, [playedScenarioIds])

  return { isPlayed, togglePlayed, playedScenarioIds, loading }
}
