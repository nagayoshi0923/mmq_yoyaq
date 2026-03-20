import { useMemo, useCallback } from 'react'
import { getTimeSlot } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

const EMPTY_SLOT_EVENTS: ScheduleEvent[] = []

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

function slotLookupKey(
  date: string,
  venue: string,
  timeSlot: 'morning' | 'afternoon' | 'evening'
): string {
  return `${date}\0${venue}\0${timeSlot}`
}

/** 店舗一覧がまだないときのセル照合用（全イベント走査） */
function filterEventsForSlotLegacy(
  events: ScheduleEvent[],
  selectedCategory: string,
  date: string,
  venue: string,
  timeSlot: 'morning' | 'afternoon' | 'evening'
): ScheduleEvent[] {
  return events.filter((event) => {
    const dateMatch = event.date === date
    const savedTimeSlot = event.time_slot
    const eventTimeSlot = convertTimeSlot(savedTimeSlot) || getTimeSlot(event.start_time)
    const timeSlotMatch = eventTimeSlot === timeSlot
    const categoryMatch = selectedCategory === 'all' || event.category === selectedCategory

    if (event.is_private_request) {
      if (event.venue) {
        const venueMatch = event.venue === venue
        return dateMatch && timeSlotMatch && venueMatch && categoryMatch
      }
      return dateMatch && timeSlotMatch && categoryMatch
    }

    const venueMatch = event.venue === venue
    return dateMatch && venueMatch && timeSlotMatch && categoryMatch
  })
}

/**
 * スケジュールイベント関連のロジックフック
 * @param storesForSlotIndex 日×店舗×枠のルックアップ用（貸切・店舗未確定を全店舗セルに展開する）
 */
export function useScheduleEvents(
  events: ScheduleEvent[],
  selectedCategory: string,
  scenarios: any[],
  shiftData: Record<string, Staff[]>,
  eventOperations: any,
  storesForSlotIndex: { id: string }[] = []
) {
  const storeIds = useMemo(
    () => storesForSlotIndex.map((s) => s.id),
    [storesForSlotIndex]
  )

  const slotEventsMap = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>()
    if (storeIds.length === 0) {
      return map
    }

    const append = (key: string, ev: ScheduleEvent) => {
      const existing = map.get(key)
      if (existing) {
        existing.push(ev)
      } else {
        map.set(key, [ev])
      }
    }

    for (const event of events) {
      if (!(selectedCategory === 'all' || event.category === selectedCategory)) {
        continue
      }

      const eventTimeSlot = convertTimeSlot(event.time_slot) || getTimeSlot(event.start_time)

      if (event.is_private_request) {
        if (event.venue) {
          append(slotLookupKey(event.date, event.venue, eventTimeSlot), event)
        } else {
          for (const sid of storeIds) {
            append(slotLookupKey(event.date, sid, eventTimeSlot), event)
          }
        }
        continue
      }

      append(slotLookupKey(event.date, event.venue, eventTimeSlot), event)
    }

    return map
  }, [events, selectedCategory, storeIds])

  const getEventsForSlot = useCallback(
    (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      if (storeIds.length === 0) {
        return filterEventsForSlotLegacy(events, selectedCategory, date, venue, timeSlot)
      }
      return slotEventsMap.get(slotLookupKey(date, venue, timeSlot)) ?? EMPTY_SLOT_EVENTS
    },
    [storeIds.length, slotEventsMap, events, selectedCategory]
  )

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
      timeSlot = eventOperations.modalInitialData.time_slot
    } else if (eventOperations.editingEvent) {
      date = eventOperations.editingEvent.date
      // time_slot（選択した枠）を優先、なければstart_timeから判定
      const savedSlot = convertTimeSlot(eventOperations.editingEvent.time_slot)
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
      timeSlot = eventOperations.modalInitialData.time_slot
    } else if (eventOperations.editingEvent) {
      date = eventOperations.editingEvent.date
      // time_slot（選択した枠）を優先、なければstart_timeから判定
      const savedSlot = convertTimeSlot(eventOperations.editingEvent.time_slot)
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

