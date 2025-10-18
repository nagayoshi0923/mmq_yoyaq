// sessionStorageと同期するstate管理フック（汎用版）

import { useState, useEffect, useCallback } from 'react'

/**
 * sessionStorageと自動同期するuseStateの代替
 * 
 * @param key - sessionStorageのキー
 * @param defaultValue - デフォルト値
 * @returns [state, setState] のタプル
 * 
 * @example
 * const [selectedPeriod, setSelectedPeriod] = useSessionState('salesPeriod', 'thisMonth')
 */
export function useSessionState<T>(key: string, defaultValue: T) {
  // 初期値をsessionStorageから復元（または defaultValue を使用）
  const [state, setState] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key)
      if (saved !== null) {
        return JSON.parse(saved) as T
      }
    } catch (error) {
      console.warn(`Failed to load "${key}" from sessionStorage:`, error)
    }
    return defaultValue
  })

  // stateが変更されたらsessionStorageに保存
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.warn(`Failed to save "${key}" to sessionStorage:`, error)
    }
  }, [key, state])

  // setStateのラッパー（型安全性を保持）
  const setStateWrapper = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState(value)
    },
    []
  )

  return [state, setStateWrapper] as const
}

