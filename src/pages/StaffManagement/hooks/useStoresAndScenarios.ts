import { useState, useCallback, useMemo } from 'react'
import { storeApi, scenarioApi } from '@/lib/api'
import type { Store, Scenario } from '@/types'
import { logger } from '@/utils/logger'

/**
 * 店舗とシナリオデータを管理するフック
 */
export function useStoresAndScenarios() {
  const [stores, setStores] = useState<Store[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])

  /**
   * 店舗データを読み込む
   */
  const loadStores = useCallback(async () => {
    try {
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: any) {
      logger.error('Error loading stores:', err)
    }
  }, [])

  /**
   * シナリオデータを読み込む
   */
  const loadScenarios = useCallback(async () => {
    try {
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (err: any) {
      logger.error('Error loading scenarios:', err)
    }
  }, [])

  /**
   * シナリオIDからシナリオオブジェクトを取得
   * scenarioIdはscenarios.idまたはscenario_master_id（scenario_mastersテーブルのID）のどちらでも対応
   */
  const getScenario = useCallback((scenarioId: string): Scenario | undefined => {
    return scenarios.find(s => s.id === scenarioId) ?? scenarios.find(s => s.scenario_master_id === scenarioId)
  }, [scenarios])

  /**
   * シナリオIDから名前を取得
   * scenarioIdはscenarios.idまたはscenario_master_id（scenario_mastersテーブルのID）のどちらでも対応
   */
  const getScenarioName = useCallback((scenarioId: string) => {
    return getScenario(scenarioId)?.title || '不明なシナリオ'
  }, [getScenario])

  /**
   * シナリオIDリストから名前リストを取得
   */
  const getScenarioNames = useCallback((scenarioIds: string[]) => {
    return scenarioIds
      .map(id => getScenarioName(id))
      .filter(name => name !== '不明なシナリオ')
  }, [getScenarioName])

  /**
   * シナリオの選択肢リスト（Select用）
   */
  const scenarioOptions = useMemo(() => {
    return scenarios.map(scenario => ({
      value: scenario.id,
      label: scenario.title
    }))
  }, [scenarios])

  /**
   * 店舗の選択肢リスト（Select用）
   */
  const storeOptions = useMemo(() => {
    return stores.map(store => ({
      value: store.id,
      label: store.name
    }))
  }, [stores])

  return {
    stores,
    scenarios,
    loadStores,
    loadScenarios,
    getScenario,
    getScenarioName,
    getScenarioNames,
    scenarioOptions,
    storeOptions
  }
}

