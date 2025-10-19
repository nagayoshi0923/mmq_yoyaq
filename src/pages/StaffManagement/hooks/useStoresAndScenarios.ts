import { useState, useCallback, useMemo } from 'react'
import { storeApi, scenarioApi } from '@/lib/api'
import type { Store } from '@/types'
import { logger } from '@/utils/logger'

interface Scenario {
  id: string
  title: string
  [key: string]: any
}

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
   * シナリオIDから名前を取得
   */
  const getScenarioName = useCallback((scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId)
    return scenario?.title || '不明なシナリオ'
  }, [scenarios])

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
    getScenarioName,
    getScenarioNames,
    scenarioOptions,
    storeOptions
  }
}

