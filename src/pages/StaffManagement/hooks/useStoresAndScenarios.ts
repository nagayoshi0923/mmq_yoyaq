import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi, scenarioApi } from '@/lib/api'
import type { Store, Scenario } from '@/types'

export const storeScenarioKeys = {
  stores: ['staff-page-stores'] as const,
  scenarios: ['staff-page-scenarios'] as const,
}

export function useStoresAndScenarios() {
  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: storeScenarioKeys.stores,
    queryFn: () => storeApi.getAll(),
    staleTime: 30 * 60 * 1000,
  })

  const { data: scenarios = [] } = useQuery<Scenario[]>({
    queryKey: storeScenarioKeys.scenarios,
    queryFn: () => scenarioApi.getAll(),
    staleTime: 30 * 60 * 1000,
  })

  const getScenario = useCallback((scenarioId: string): Scenario | undefined => {
    return scenarios.find(s => s.id === scenarioId) ?? scenarios.find(s => s.scenario_master_id === scenarioId)
  }, [scenarios])

  const getScenarioName = useCallback((scenarioId: string) => {
    return getScenario(scenarioId)?.title || '不明なシナリオ'
  }, [getScenario])

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
    loadStores,
    loadScenarios,
    getScenario,
    getScenarioName,
    getScenarioNames,
    scenarioOptions,
    storeOptions,
  }
}
