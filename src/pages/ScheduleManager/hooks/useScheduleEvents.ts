import { useMemo } from 'react'
import { getTimeSlot } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

/**
 * スケジュールイベント関連のロジックフック
 */
export function useScheduleEvents(
  events: ScheduleEvent[],
  selectedCategory: string,
  scenarios: any[],
  shiftData: Record<string, Staff[]>,
  eventOperations: any
) {
  /**
   * 特定の日付・店舗・時間帯の公演を取得
   */
  const getEventsForSlot = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    return events.filter(event => {
      const dateMatch = event.date === date
      const detectedTimeSlot = getTimeSlot(event.start_time)
      const timeSlotMatch = detectedTimeSlot === timeSlot
      const categoryMatch = selectedCategory === 'all' || event.category === selectedCategory

      // 貸切リクエストの場合
      if (event.is_private_request) {
        // 店舗が確定している場合はその店舗のセルにのみ表示
        if (event.venue) {
          const venueMatch = event.venue === venue
          return dateMatch && timeSlotMatch && venueMatch && categoryMatch
        } else {
          // 店舗未確定の場合は全店舗のセルに表示
          return dateMatch && timeSlotMatch && categoryMatch
        }
      }

      // 通常の公演
      const venueMatch = event.venue === venue
      return dateMatch && venueMatch && timeSlotMatch && categoryMatch
    })
  }

  /**
   * シナリオごとの出勤可能GMを計算
   */
  const availableStaffByScenario = useMemo(() => {
    if (!eventOperations.isPerformanceModalOpen || !scenarios.length) {
      return {}
    }

    let date: string
    let timeSlot: string

    if (eventOperations.modalInitialData) {
      date = eventOperations.modalInitialData.date
      timeSlot = eventOperations.modalInitialData.timeSlot
    } else if (eventOperations.editingEvent) {
      date = eventOperations.editingEvent.date
      const startHour = parseInt(eventOperations.editingEvent.start_time.split(':')[0])
      if (startHour < 12) {
        timeSlot = 'morning'
      } else if (startHour < 17) {
        timeSlot = 'afternoon'
      } else {
        timeSlot = 'evening'
      }
    } else {
      return {}
    }

    const key = `${date}-${timeSlot}`
    const availableStaff = shiftData[key] || []

    const staffByScenario: Record<string, Staff[]> = {}

    for (const scenario of scenarios) {
      const gmList = availableStaff.filter(staffMember => {
        const specialScenarios = staffMember.special_scenarios || []
        const hasScenarioById = specialScenarios.includes(scenario.id)
        const hasScenarioByTitle = specialScenarios.includes(scenario.title)
        return hasScenarioById || hasScenarioByTitle
      })
      staffByScenario[scenario.title] = gmList
    }

    return staffByScenario
  }, [eventOperations.isPerformanceModalOpen, eventOperations.modalInitialData, eventOperations.editingEvent, shiftData, scenarios])

  return {
    getEventsForSlot,
    availableStaffByScenario
  }
}

