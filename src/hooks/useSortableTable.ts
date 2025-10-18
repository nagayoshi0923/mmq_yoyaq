import { useState, useCallback } from 'react'
import type { SortDirection, SortState, SortableConfig } from '@/types/sortable'
import { logger } from '@/utils/logger'

export function useSortableTable<T extends string, D = any>(
  config: SortableConfig<T>
) {
  // localStorageから並び替え状態を復元
  const [sortState, setSortState] = useState<SortState<T>>(() => {
    try {
      const saved = localStorage.getItem(config.storageKey)
      if (saved) {
        const { field, direction } = JSON.parse(saved)
        return {
          field: field || config.defaultField,
          direction: direction || config.defaultDirection
        }
      }
    } catch (error) {
      console.warn(`Failed to load sort state from localStorage (${config.storageKey}):`, error)
    }
    return {
      field: config.defaultField,
      direction: config.defaultDirection
    }
  })

  // 並び替え処理
  const handleSort = useCallback((field: T) => {
    let newDirection: SortDirection
    
    if (sortState.field === field) {
      // 同じフィールドをクリックした場合：asc ↔ desc のサイクル
      newDirection = sortState.direction === 'asc' ? 'desc' : 'asc'
    } else {
      // 異なるフィールドをクリックした場合：昇順から開始
      newDirection = 'asc'
    }
    
    const newState: SortState<T> = {
      field,
      direction: newDirection
    }
    
    setSortState(newState)
    
    // localStorageに保存
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(newState))
    } catch (error) {
      console.warn(`Failed to save sort state to localStorage (${config.storageKey}):`, error)
    }
  }, [sortState, config.storageKey])

  // データの並び替え
  const sortData = useCallback((data: D[]) => {
    return [...data].sort((a, b) => {
      let aValue: any = (a as any)[sortState.field]
      let bValue: any = (b as any)[sortState.field]
      
      // 文字列の場合は小文字で比較
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }
      
      // null/undefined の処理
      if (aValue == null && bValue == null) return 0
      if (aValue == null) return sortState.direction === 'asc' ? 1 : -1
      if (bValue == null) return sortState.direction === 'asc' ? -1 : 1
      
      let comparison = 0
      if (aValue < bValue) {
        comparison = -1
      } else if (aValue > bValue) {
        comparison = 1
      }
      
      return sortState.direction === 'asc' ? comparison : -comparison
    })
  }, [sortState])

  // ヘッダーのスタイルを取得
  const getHeaderStyle = useCallback((field: T) => {
    const baseStyle = 'cursor-pointer hover:bg-muted/50'
    
    if (sortState.field !== field) {
      return baseStyle
    }
    
    if (sortState.direction === 'asc') {
      return `${baseStyle} border-t-2 border-t-blue-500`
    } else {
      return `${baseStyle} border-b-2 border-b-blue-500`
    }
  }, [sortState])

  return {
    sortState,
    handleSort,
    sortData,
    getHeaderStyle
  }
}
