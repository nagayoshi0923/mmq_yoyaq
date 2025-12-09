import { useMemo } from 'react'
import { getTimeSlot } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

/**
 * time_slot（'朝'/'昼'/'夜'）を英語形式に変換
 */
function convertTimeSlot(timeSlot: string | undefined): 'morning' | 'afternoon' | 'evening' | null {
  if (!timeSlot) return null
  switch (timeSlot) {
    case '朝': return 'morning'
    case '昼': return 'afternoon'
    case '夜': return 'evening'
    default: return null
  }
}

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
      // time_slot（選択した枠）を優先、なければstart_timeから判定（フォールバック）
      // event.timeSlot (camelCase) または (event as any).time_slot (snake_case) をチェック
      const savedTimeSlot = event.timeSlot || (event as any).time_slot
      const eventTimeSlot = convertTimeSlot(savedTimeSlot) || getTimeSlot(event.start_time)
      
      // デバッグ: 17時の公演を確認
      if (event.start_time?.startsWith('17:')) {
        console.log('🔍 17時公演のtime_slot確認:', {
          scenario: event.scenario,
          timeSlot_camel: event.timeSlot,
          time_slot_snake: (event as any).time_slot,
          savedTimeSlot,
          convertedTimeSlot: convertTimeSlot(savedTimeSlot),
          eventTimeSlot,
          targetSlot: timeSlot
        })
      }
      
      const timeSlotMatch = eventTimeSlot === timeSlot
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
      // time_slot（選択した枠）を優先、なければstart_timeから判定
      const savedSlot = convertTimeSlot(eventOperations.editingEvent.timeSlot)
      if (savedSlot) {
        timeSlot = savedSlot
      } else {
        const startHour = parseInt(eventOperations.editingEvent.start_time.split(':')[0])
        if (startHour < 12) {
          timeSlot = 'morning'
        } else if (startHour < 17) {
          timeSlot = 'afternoon'
        } else {
          timeSlot = 'evening'
        }
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

  /**
   * その日時に出勤している全GMを取得（シナリオ未選択時用）
   */
  const allAvailableStaff = useMemo(() => {
    if (!eventOperations.isPerformanceModalOpen) {
      return []
    }

    let date: string
    let timeSlot: string

    if (eventOperations.modalInitialData) {
      date = eventOperations.modalInitialData.date
      timeSlot = eventOperations.modalInitialData.timeSlot
    } else if (eventOperations.editingEvent) {
      date = eventOperations.editingEvent.date
      // time_slot（選択した枠）を優先、なければstart_timeから判定
      const savedSlot = convertTimeSlot(eventOperations.editingEvent.timeSlot)
      if (savedSlot) {
        timeSlot = savedSlot
      } else {
        const startHour = parseInt(eventOperations.editingEvent.start_time.split(':')[0])
        if (startHour < 12) {
          timeSlot = 'morning'
        } else if (startHour < 17) {
          timeSlot = 'afternoon'
        } else {
          timeSlot = 'evening'
        }
      }
    } else {
      return []
    }

    const key = `${date}-${timeSlot}`
    return shiftData[key] || []
  }, [eventOperations.isPerformanceModalOpen, eventOperations.modalInitialData, eventOperations.editingEvent, shiftData])

  return {
    getEventsForSlot,
    availableStaffByScenario,
    allAvailableStaff
  }
}

