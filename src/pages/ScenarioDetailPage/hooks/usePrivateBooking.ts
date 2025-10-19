import { useState, useCallback } from 'react'
import type { TimeSlot, EventSchedule } from '../utils/types'

interface UsePrivateBookingProps {
  events: EventSchedule[]
  stores: any[]
}

/**
 * 貸切リクエスト関連のロジックを管理するフック
 */
export function usePrivateBooking({ events, stores }: UsePrivateBookingProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const MAX_SELECTIONS = 10

  // 特定の日付と時間枠が空いているかチェック（店舗フィルター対応）
  const checkTimeSlotAvailability = useCallback((date: string, slot: TimeSlot, storeIds?: string[]): boolean => {
    // 店舗が選択されている場合
    if (storeIds && storeIds.length > 0) {
      return storeIds.some(storeId => {
        const storeEvents = events.filter(e => e.date === date && e.store_id === storeId)
        if (storeEvents.length === 0) return true
        
        const hasConflict = storeEvents.some(event => {
          const eventStart = event.start_time.slice(0, 5)
          const eventEnd = event.end_time.slice(0, 5)
          const slotStart = slot.startTime
          const slotEnd = slot.endTime
          return !(eventEnd <= slotStart || eventStart >= slotEnd)
        })
        
        return !hasConflict
      })
    }
    
    // 店舗が選択されていない場合：すべての店舗を対象
    const allStoreIds = stores.map(s => s.id)
    return allStoreIds.some(storeId => {
      const storeEvents = events.filter(e => e.date === date && e.store_id === storeId)
      if (storeEvents.length === 0) return true
      
      const hasConflict = storeEvents.some(event => {
        const eventStart = event.start_time.slice(0, 5)
        const eventEnd = event.end_time.slice(0, 5)
        const slotStart = slot.startTime
        const slotEnd = slot.endTime
        return !(eventEnd <= slotStart || eventStart >= slotEnd)
      })
      
      return !hasConflict
    })
  }, [events, stores])

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

