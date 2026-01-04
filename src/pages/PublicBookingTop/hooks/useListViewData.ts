import { useState, useMemo, useCallback } from 'react'
import { formatDateJST } from '@/utils/dateUtils'

interface ListViewDataItem {
  date: number
  store: any
}

/**
 * リスト表示のロジックを管理するフック
 */
export function useListViewData(allEvents: any[], stores: any[], selectedStoreIds: string[], blockedSlots: any[] = []) {
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
   * イベントを日付×店舗IDでインデックス化（臨時会場の表示判定用）
   * store_idとvenueの両方をキーとして保存
   */
  const eventDateStoreSet = useMemo(() => {
    const set = new Set<string>()
    allEvents.forEach(event => {
      const dateStr = event.date
      // オープン公演のみカウント（category === 'open'）
      if (event.category === 'open' && !event.is_cancelled) {
        // store_idがあれば追加
        if (event.store_id) {
          set.add(`${dateStr}:${event.store_id}`)
        }
        // venueがあれば追加（店舗名やshort_nameの場合）
        if (event.venue) {
          set.add(`${dateStr}:${event.venue}`)
        }
      }
    })
    // デバッグ: 臨時会場のオープン公演を確認
    console.log('📍 eventDateStoreSet:', Array.from(set).filter(k => k.includes('9729') || k.includes('臨時')))
    return set
  }, [allEvents])

  // デバッグ: 臨時会場の店舗情報
  console.log('📍 stores with is_temporary:', stores.filter(s => s.is_temporary).map(s => ({ id: s.id, name: s.name })))

  /**
   * 月の日付と店舗の組み合わせを生成
   */
  const listViewData = useMemo((): ListViewDataItem[] => {
    const year = listViewMonth.getFullYear()
    const month = listViewMonth.getMonth()
    
    // 月の日付を生成
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    
    // 通常店舗はフィルター適用、臨時会場は別処理
    const regularStores = stores.filter(store => !store.is_temporary)
    const temporaryStores = stores.filter(store => store.is_temporary)
    
    const filteredRegularStores = selectedStoreIds.length === 0 
      ? regularStores 
      : regularStores.filter(store => selectedStoreIds.includes(store.id))
    
    // 日付と店舗の組み合わせを生成
    const combinations: ListViewDataItem[] = []
    dates.forEach(date => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
      
      // 通常店舗（フィルター適用）
      filteredRegularStores.forEach(store => {
        combinations.push({ date, store })
      })
      
      // 臨時会場（フィルターに関係なく、オープン公演がある日は表示）
      temporaryStores.forEach(store => {
        // id、short_name、nameのいずれかでマッチするかチェック
        const hasOpenEvent = 
          eventDateStoreSet.has(`${dateStr}:${store.id}`) ||
          (store.short_name && eventDateStoreSet.has(`${dateStr}:${store.short_name}`)) ||
          (store.name && eventDateStoreSet.has(`${dateStr}:${store.name}`))
        if (hasOpenEvent) {
          combinations.push({ date, store })
        }
      })
    })
    
    return combinations
  }, [listViewMonth, stores, selectedStoreIds, eventDateStoreSet])

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
   * GMテスト等のブロック時間帯をインデックス化
   */
  const blockedByDateStoreSlot = useMemo(() => {
    const map = new Map<string, boolean>()
    blockedSlots.forEach(event => {
      const dateStr = event.date
      const eventStoreId = event.store_id || event.venue
      // 時間帯を判定
      const hour = parseInt(event.start_time?.split(':')[0] || '0')
      let timeSlot = 'morning'
      if (hour >= 12 && hour <= 17) timeSlot = 'afternoon'
      else if (hour >= 18) timeSlot = 'evening'
      
      const key = `${dateStr}:${eventStoreId}:${timeSlot}`
      map.set(key, true)
    })
    return map
  }, [blockedSlots])

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

  /**
   * 指定の日付・店舗・時間帯がGMテスト等でブロックされているかチェック
   */
  const isSlotBlocked = useCallback((date: number, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
    const dateStr = formatDateJST(dateObj)
    
    // 店舗情報を取得
    const store = storeMap.get(storeId)
    if (!store) return false
    
    // 可能な店舗ID/名前の組み合わせでチェック
    const possibleKeys = [
      `${dateStr}:${storeId}:${timeSlot}`,
      `${dateStr}:${store.short_name}:${timeSlot}`,
      `${dateStr}:${store.name}:${timeSlot}`
    ]
    
    return possibleKeys.some(key => blockedByDateStoreSlot.has(key))
  }, [blockedByDateStoreSlot, storeMap, listViewMonth])

  return {
    listViewMonth,
    setListViewMonth,
    listViewData,
    changeListViewMonth,
    getEventsForDateStore,
    getStoreName,
    getStoreColor,
    isSlotBlocked,
    generateListViewData: () => listViewData
  }
}

