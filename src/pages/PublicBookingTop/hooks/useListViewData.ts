import { useState, useMemo, useCallback } from 'react'

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
   * 特定の日付・店舗の公演を取得
   */
  const getEventsForDateStore = useCallback((date: number, storeId: string) => {
    const dateStr = `${listViewMonth.getFullYear()}-${String(listViewMonth.getMonth() + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    const filtered = allEvents.filter((event: any) => {
      const eventStore = event.venue || event.store_id
      // より柔軟な店舗照合（ID、short_name、nameで照合）
      const storeMatches = eventStore === storeId || 
                          eventStore === stores.find(s => s.id === storeId)?.short_name ||
                          eventStore === stores.find(s => s.id === storeId)?.name ||
                          stores.find(s => s.id === storeId)?.short_name === eventStore ||
                          stores.find(s => s.id === storeId)?.name === eventStore
      
      return event.date === dateStr && storeMatches
    })
    
    return filtered
  }, [allEvents, stores, listViewMonth])

  /**
   * 店舗名を取得
   */
  const getStoreName = useCallback((event: any): string => {
    const store = stores.find(s => s.id === event.store_id || s.id === event.venue)
    return store?.short_name || store?.name || ''
  }, [stores])

  /**
   * 店舗の色を取得
   */
  const getStoreColor = useCallback((event: any): string => {
    const store = stores.find(s => s.id === event.store_id || s.id === event.venue)
    return store?.color || '#gray'
  }, [stores])

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

