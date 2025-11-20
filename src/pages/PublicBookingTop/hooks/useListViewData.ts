import { useState, useMemo, useCallback } from 'react'
import { formatDateJST } from '@/utils/dateUtils'

interface ListViewDataItem {
  date: number
  store: any
}

/**
 * リスト表示のロジックを管理するフック
 */
export function useListViewData(allEvents: any[], stores: any[], selectedStoreFilter: string) {
  const [listViewMonth, setListViewMonth] = useState(new Date())

  /**
   * 月を変更
   */
  const changeListViewMonth = useCallback((direction: 'prev' | 'next') => {
    setListViewMonth(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }, [])

  /**
   * 月の日付と店舗の組み合わせを生成
   */
  const listViewData = useMemo((): ListViewDataItem[] => {
    const year = listViewMonth.getFullYear()
    const month = listViewMonth.getMonth()
    
    // 月の日付を生成
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    
    // 店舗フィルター適用
    const filteredStores = selectedStoreFilter === 'all' 
      ? stores 
      : stores.filter(store => store.id === selectedStoreFilter)
    
    // 日付と店舗の組み合わせを生成
    const combinations: ListViewDataItem[] = []
    dates.forEach(date => {
      filteredStores.forEach(store => {
        combinations.push({ date, store })
      })
    })
    
    return combinations
  }, [listViewMonth, stores, selectedStoreFilter])

  /**
   * 最適化: 店舗データをMapに変換（O(1)アクセス）
   */
  const storeMap = useMemo(() => {
    const map = new Map<string, any>()
    stores.forEach(store => {
      map.set(store.id, store)
      if (store.short_name) map.set(store.short_name, store)
      if (store.name) map.set(store.name, store)
    })
    return map
  }, [stores])

  /**
   * 最適化: イベントを日付×店舗でインデックス化（メモ化）
   */
  const eventsByDateStore = useMemo(() => {
    const map = new Map<string, any[]>()
    allEvents.forEach(event => {
      const dateStr = event.date
      const eventStoreId = event.store_id || event.venue
      const key = `${dateStr}:${eventStoreId}`
      
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(event)
    })
    return map
  }, [allEvents])

  /**
   * 特定の日付・店舗の公演を取得
   * 最適化: インデックス化されたイベントを使用（O(1)アクセス）
   */
  const getEventsForDateStore = useCallback((date: number, storeId: string) => {
    const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
    const dateStr = formatDateJST(dateObj)
    
    // 店舗情報を取得（一度だけ）
    const store = storeMap.get(storeId)
    if (!store) return []
    
    // 可能な店舗ID/名前の組み合わせで検索
    const possibleKeys = [
      `${dateStr}:${storeId}`,
      `${dateStr}:${store.short_name}`,
      `${dateStr}:${store.name}`
    ]
    
    const events: any[] = []
    possibleKeys.forEach(key => {
      const keyEvents = eventsByDateStore.get(key) || []
      events.push(...keyEvents)
    })
    
    // 重複を除去
    return Array.from(new Map(events.map(e => [e.id, e])).values())
  }, [eventsByDateStore, storeMap, listViewMonth])

  /**
   * 店舗名を取得
   * 最適化: Mapから直接取得（O(1)アクセス）
   */
  const getStoreName = useCallback((event: any): string => {
    const store = storeMap.get(event.store_id) || storeMap.get(event.venue)
    return store?.short_name || store?.name || ''
  }, [storeMap])

  /**
   * 店舗の色を取得
   * 最適化: Mapから直接取得（O(1)アクセス）
   */
  const getStoreColor = useCallback((event: any): string => {
    const store = storeMap.get(event.store_id) || storeMap.get(event.venue)
    return store?.color || '#gray'
  }, [storeMap])

  return {
    listViewMonth,
    setListViewMonth,
    listViewData,
    changeListViewMonth,
    getEventsForDateStore,
    getStoreName,
    getStoreColor,
    generateListViewData: () => listViewData
  }
}

