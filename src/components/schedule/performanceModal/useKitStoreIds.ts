/**
 * 選択中シナリオのキット配置店舗一覧（scenario_master_id 単位）を取得するフック。
 * PerformanceModal の該当 state + effect を逐語移送（挙動不変）。唯一 formData.scenario を引数 scenario に置換。
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Scenario } from '@/types'

export function useKitStoreIds(scenario: string, scenarios: Scenario[]): string[] {
  // 選択中シナリオのキット配置店舗一覧 (scenario_master_id 単位)
  const [kitStoreIds, setKitStoreIds] = useState<string[]>([])

  // シナリオ変更時にキット配置店舗を取得
  useEffect(() => {
    const selectedScenario = scenarios.find(s => s.title === scenario)
    const masterId = selectedScenario?.scenario_master_id || selectedScenario?.id
    if (!masterId) {
      setKitStoreIds([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        if (!orgId) return
        const { data, error } = await supabase
          .from('scenario_kit_locations')
          .select('store_id')
          .eq('scenario_master_id', masterId)
          .eq('organization_id', orgId)
        if (error || cancelled) return
        const ids = Array.from(new Set((data || []).map(r => r.store_id).filter(Boolean) as string[]))
        setKitStoreIds(ids)
      } catch (err) {
        logger.error('キット配置店舗の取得エラー:', err)
      }
    })()
    return () => { cancelled = true }
  }, [scenario, scenarios])

  return kitStoreIds
}
