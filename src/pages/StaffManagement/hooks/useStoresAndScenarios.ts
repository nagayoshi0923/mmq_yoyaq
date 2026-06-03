import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi, scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Store, Scenario } from '@/types'

export const storeScenarioKeys = {
  stores: ['staff-page-stores'] as const,
  scenarios: ['staff-page-scenarios'] as const,
  masterTitles: ['scenario-master-titles'] as const,
}

export function useStoresAndScenarios() {
  const { data: stores = [], isLoading: storesLoading } = useQuery<Store[]>({
    queryKey: storeScenarioKeys.stores,
    queryFn: () => storeApi.getAll(),
    staleTime: 30 * 60 * 1000,
  })

  const { data: scenarios = [], isLoading: scenariosLoading } = useQuery<Scenario[]>({
    queryKey: storeScenarioKeys.scenarios,
    queryFn: () => scenarioApi.getAll(),
    staleTime: 30 * 60 * 1000,
  })

  // 組織カタログに無い master_id の fallback タイトル用 (orphan 担当履歴の表示)
  const { data: allMasterTitles = [] } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: storeScenarioKeys.masterTitles,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scenario_masters')
        .select('id, title')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; title: string }>
    },
    staleTime: 30 * 60 * 1000,
  })

  const masterTitleMap = useMemo(() => {
    const map = new Map<string, string>()
    allMasterTitles.forEach(m => map.set(m.id, m.title))
    return map
  }, [allMasterTitles])

  const getScenario = useCallback((scenarioId: string): Scenario | undefined => {
    return scenarios.find(s => s.id === scenarioId) ?? scenarios.find(s => s.scenario_master_id === scenarioId)
  }, [scenarios])

  const getScenarioName = useCallback((scenarioId: string) => {
    const fromOrg = getScenario(scenarioId)?.title
    if (fromOrg) return fromOrg
    // 組織カタログに無いが scenario_masters にはある場合は「[利用外] タイトル」形式で表示
    const fromMaster = masterTitleMap.get(scenarioId)
    if (fromMaster) return `[利用外] ${fromMaster}`
    return '不明なシナリオ'
  }, [getScenario, masterTitleMap])

  const getScenarioNames = useCallback((scenarioIds: string[]) => {
    return scenarioIds
      .map(id => getScenarioName(id))
      .filter(name => name !== '不明なシナリオ')
  }, [getScenarioName])

  const scenarioOptions = useMemo(() => {
    return scenarios.map(scenario => ({
      value: scenario.id,
      label: scenario.title
    }))
  }, [scenarios])

  const storeOptions = useMemo(() => {
    return stores.map(store => ({
      value: store.id,
      label: store.name
    }))
  }, [stores])

  // index.tsx の useEffect から呼ばれていた関数（React Query 化により不要だが互換のため残す）
  const loadStores = useCallback(() => {}, [])
  const loadScenarios = useCallback(() => {}, [])

  return {
    stores,
    scenarios,
    storesLoading,
    scenariosLoading,
    loadStores,
    loadScenarios,
    getScenario,
    getScenarioName,
    getScenarioNames,
    scenarioOptions,
    storeOptions,
  }
}
