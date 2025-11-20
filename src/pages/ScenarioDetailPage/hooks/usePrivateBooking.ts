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
    if (!scenario) return new Set()
    
    // シナリオにavailable_storesが設定されている場合
    const availableStores = scenario.available_stores || scenario.available_stores_ids
    if (Array.isArray(availableStores) && availableStores.length > 0) {
      return new Set(availableStores)
    }
    
    // 設定されていない場合は全店舗を対象
    return new Set(stores.map(s => s.id))
  }, [scenario, stores])

  // 特定の日付と時間枠が空いているかチェック（店舗フィルター対応）
  // 全店舗のイベントを使用して判定（特定シナリオのイベントのみではない）
  // そのシナリオを公演可能な店舗のみを対象とする
  const checkTimeSlotAvailability = useCallback((date: string, slot: TimeSlot, storeIds?: string[]): boolean => {
    const availableStoreIds = getAvailableStoreIds()
    
    // 店舗が選択されている場合
    if (storeIds && storeIds.length > 0) {
      return storeIds.some(storeId => {
        // そのシナリオを公演可能な店舗かチェック
        if (!availableStoreIds.has(storeId)) return false
        
        const storeEvents = allStoreEvents.filter((e: any) => 
          e.date === date && 
          (e.store_id === storeId || e.venue === storeId)
        )
        if (storeEvents.length === 0) return true
        
        const hasConflict = storeEvents.some((event: any) => {
          const eventStart = event.start_time?.slice(0, 5) || '00:00'
          const eventEnd = event.end_time?.slice(0, 5) || '23:59'
          const slotStart = slot.startTime
          const slotEnd = slot.endTime
          return !(eventEnd <= slotStart || eventStart >= slotEnd)
        })
        
        return !hasConflict
      })
    }
    
    // 店舗が選択されていない場合：そのシナリオを公演可能な店舗のみを対象
    const availableStoreIdsArray = Array.from(availableStoreIds)
    if (availableStoreIdsArray.length === 0) return false
    
    return availableStoreIdsArray.some(storeId => {
      const storeEvents = allStoreEvents.filter((e: any) => 
        e.date === date && 
        (e.store_id === storeId || e.venue === storeId)
      )
      if (storeEvents.length === 0) return true
      
      const hasConflict = storeEvents.some((event: any) => {
        const eventStart = event.start_time?.slice(0, 5) || '00:00'
        const eventEnd = event.end_time?.slice(0, 5) || '23:59'
        const slotStart = slot.startTime
        const slotEnd = slot.endTime
        return !(eventEnd <= slotStart || eventStart >= slotEnd)
      })
      
      return !hasConflict
    })
  }, [allStoreEvents, getAvailableStoreIds])

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

