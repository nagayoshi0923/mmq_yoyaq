// localStorageと同期するstate管理フック（セッションをまたいで永続化）

import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'

/**
 * localStorageと自動同期するuseStateの代替。
 * sessionStateと異なり、ブラウザを閉じても・新しいタブを開いても設定が維持される。
 * フィルター・店舗選択など「よく使う設定」のデフォルト保存に使用する。
 *
 * @param key - localStorageのキー
 * @param defaultValue - デフォルト値（保存値がない場合に使用）
 * @returns [state, setState] のタプル
 *
 * @example
 * const [selectedStores, setSelectedStores] = useLocalState<string[]>('scheduleSelectedStores', [])
 */
export function useLocalState<T>(key: string, defaultValue: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved !== null) {
        return JSON.parse(saved) as T
      }
    } catch (error) {
      logger.warn(`Failed to load "${key}" from localStorage:`, error)
    }
    return defaultValue
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      logger.warn(`Failed to save "${key}" to localStorage:`, error)
    }
  }, [key, state])

  const setStateWrapper = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState(value)
    },
    []
  )

  return [state, setStateWrapper] as const
}
