import { useState, useCallback, useEffect } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { TimeSlot, EventSchedule } from '../utils/types'

interface UsePrivateBookingProps {
  events: EventSchedule[]
  stores: any[]
  scenarioId: string
  scenario?: any // シナリオデータ（available_storesを含む）
}

/**
 * 貸切リクエスト関連のロジックを管理するフック
 */
export function usePrivateBooking({ events, stores, scenarioId, scenario }: UsePrivateBookingProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  const MAX_SELECTIONS = 10

  // 現在の月から3ヶ月先までの全店舗のイベントを取得（貸切申込可能日判定用）
  useEffect(() => {
    const loadAllStoreEvents = async () => {
      try {
        const currentDate = new Date()
        const monthPromises = []
        
        // 現在の月から3ヶ月先までの公演を並列取得
        for (let i = 0; i < 3; i++) {
          const targetDate = new Date(currentDate)
          targetDate.setMonth(currentDate.getMonth() + i)
          
          const year = targetDate.getFullYear()
          const month = targetDate.getMonth() + 1
          
          monthPromises.push(scheduleApi.getByMonth(year, month))
        }
        
        const monthResults = await Promise.all(monthPromises)
        const allEvents = monthResults.flat()
        
        // 貸切申込可能日判定用：予約可能な通常公演のみをフィルタリング
        // 貸切公演は既に確定しているので、空き判定の対象外
        const validEvents = allEvents.filter((event: any) => 
          !event.is_cancelled && 
          event.category === 'open' &&
          event.is_reservation_enabled !== false
        )
        
        setAllStoreEvents(validEvents)
      } catch (error) {
        console.error('全店舗イベントの取得エラー:', error)
        setAllStoreEvents([])
      }
    }
    
    loadAllStoreEvents()
  }, [])

  // そのシナリオを公演可能な店舗IDを取得（シナリオのavailable_stores設定から）
  const getAvailableStoreIds = useCallback((): Set<string> => {
    // シナリオにavailable_storesが設定されている場合のみ、その店舗に限定
    if (scenario) {
      const availableStores = scenario.available_stores || scenario.available_stores_ids
      // 配列が存在し、かつ空でない場合のみ限定
      if (Array.isArray(availableStores) && availableStores.length > 0) {
        return new Set(availableStores)
      }
    }
    
    // 設定されていない場合、または空配列の場合は全店舗を対象
    return new Set(stores.map(s => s.id))
  }, [scenario, stores])
  
  // イベントの店舗IDを取得（store_id、stores.id、venueから店舗名で検索）
  const getEventStoreId = useCallback((event: any): string | null => {
    // 優先順位：store_id > stores.id > venue（店舗名で検索）
    if (event.store_id) return event.store_id
    if (event.stores?.id) return event.stores.id
    if (event.venue) {
      // venueが店舗ID（UUID）の場合
      if (stores.some(s => s.id === event.venue)) {
        return event.venue
      }
      // venueが店舗名の場合、stores配列から検索
      const store = stores.find(s => s.name === event.venue || s.short_name === event.venue)
      if (store) return store.id
    }
    return null
  }, [stores])

  // 特定の日付と時間枠が空いているかチェック（店舗フィルター対応）
  // 全店舗のイベントを使用して判定（特定シナリオのイベントのみではない）
  // そのシナリオを公演可能な店舗のみを対象とする
  const checkTimeSlotAvailability = useCallback((date: string, slot: TimeSlot, storeIds?: string[]): boolean => {
    const availableStoreIds = getAvailableStoreIds()
    
    // 店舗データがまだ読み込まれていない場合は、とりあえずtrueを返す（後で再評価される）
    if (stores.length === 0) return true
    
    // allStoreEventsがまだ読み込まれていない場合は、とりあえずtrueを返す（後で再評価される）
    // ただし、選択された店舗がある場合は、より慎重に判定する
    if (allStoreEvents.length === 0) {
      // 店舗が選択されている場合は、イベントデータがないのでfalseを返す（安全側に倒す）
      if (storeIds && storeIds.length > 0) return false
      return true
    }
    
    // 店舗が選択されている場合：選択された店舗のいずれかで空きがあればtrue
    if (storeIds && storeIds.length > 0) {
      // 選択された店舗のうち、そのシナリオを公演可能な店舗のみをフィルタリング
      const validStoreIds = storeIds.filter(storeId => {
        // availableStoreIdsが空の場合は全店舗対象
        if (availableStoreIds.size === 0) return true
        return availableStoreIds.has(storeId)
      })
      
      // 有効な店舗がない場合はfalse
      if (validStoreIds.length === 0) return false
      
      // 各店舗の空き状況をチェック
      const storeAvailability = validStoreIds.map(storeId => {
        // その店舗のイベントをフィルタリング
        const storeEvents = allStoreEvents.filter((e: any) => {
          const eventStoreId = getEventStoreId(e)
          // eventStoreIdがnullの場合は無視（店舗情報が取得できないイベント）
          if (!eventStoreId) return false
          
          // 日付の比較（フォーマットを統一）
          const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
          const targetDate = date.split('T')[0]
          
          return eventDate === targetDate && eventStoreId === storeId
        })
        
        // イベントがない場合は空いている
        if (storeEvents.length === 0) return true
        
        // 時間枠の衝突をチェック
        const hasConflict = storeEvents.some((event: any) => {
          const eventStart = event.start_time?.slice(0, 5) || '00:00'
          const eventEnd = event.end_time?.slice(0, 5) || '23:59'
          const slotStart = slot.startTime
          const slotEnd = slot.endTime
          
          // 時間の衝突判定：イベントの開始時刻がスロットの終了時刻より前、かつイベントの終了時刻がスロットの開始時刻より後
          return !(eventEnd <= slotStart || eventStart >= slotEnd)
        })
        
        return !hasConflict
      })
      
      // いずれかの店舗で空きがあればtrue
      return storeAvailability.some(available => available === true)
    }
    
    // 店舗が選択されていない場合：そのシナリオを公演可能な店舗のみを対象
    const availableStoreIdsArray = Array.from(availableStoreIds)
    
    // availableStoreIdsが空の場合は、storesが空（まだ読み込まれていない）か、何か問題がある
    if (availableStoreIdsArray.length === 0) {
      // storesが空の場合はまだ読み込まれていないので、とりあえずtrueを返す
      return stores.length === 0
    }
    
    // 各店舗の空き状況をチェック
    const storeAvailability = availableStoreIdsArray.map(storeId => {
      // その店舗のイベントをフィルタリング
      const storeEvents = allStoreEvents.filter((e: any) => {
        const eventStoreId = getEventStoreId(e)
        // eventStoreIdがnullの場合は無視（店舗情報が取得できないイベント）
        if (!eventStoreId) return false
        
        // 日付の比較（フォーマットを統一）
        const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
        const targetDate = date.split('T')[0]
        
        return eventDate === targetDate && eventStoreId === storeId
      })
      
      // イベントがない場合は空いている
      if (storeEvents.length === 0) return true
      
      // 時間枠の衝突をチェック
      const hasConflict = storeEvents.some((event: any) => {
        const eventStart = event.start_time?.slice(0, 5) || '00:00'
        const eventEnd = event.end_time?.slice(0, 5) || '23:59'
        const slotStart = slot.startTime
        const slotEnd = slot.endTime
        
        // 時間の衝突判定：イベントの開始時刻がスロットの終了時刻より前、かつイベントの終了時刻がスロットの開始時刻より後
        return !(eventEnd <= slotStart || eventStart >= slotEnd)
      })
      
      return !hasConflict
    })
    
    // いずれかの店舗で空きがあればtrue
    return storeAvailability.some(available => available === true)
  }, [allStoreEvents, getAvailableStoreIds, getEventStoreId, stores])

  // 貸切リクエスト用の日付リストを生成（指定月の1ヶ月分）
  const generatePrivateDates = useCallback(() => {
    const dates: string[] = []
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const lastDay = new Date(year, month + 1, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day)
      if (date >= today) {
        dates.push(date.toISOString().split('T')[0])
      }
    }
    
    return dates
  }, [currentMonth])

  // 月を切り替え
  const changeMonth = useCallback((offset: number) => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(currentMonth.getMonth() + offset)
    setCurrentMonth(newMonth)
  }, [currentMonth])

  // 時間枠の選択/解除を切り替え
  const toggleTimeSlot = useCallback((date: string, slot: TimeSlot) => {
    const exists = selectedTimeSlots.some(
      s => s.date === date && s.slot.label === slot.label
    )
    
    if (exists) {
      setSelectedTimeSlots(prev => prev.filter(
        s => !(s.date === date && s.slot.label === slot.label)
      ))
    } else {
      if (selectedTimeSlots.length < MAX_SELECTIONS) {
        setSelectedTimeSlots(prev => [...prev, { date, slot }])
      } else {
        alert(`最大${MAX_SELECTIONS}枠まで選択できます`)
      }
    }
  }, [selectedTimeSlots])

  return {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot
  }
}

