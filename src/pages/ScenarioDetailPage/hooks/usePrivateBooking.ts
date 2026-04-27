import { useState, useCallback, useMemo, useRef } from 'react'
import { showToast } from '@/utils/toast'
import { usePrivateBookingStorePreference, useStoreFilterPreference } from '@/hooks/useUserPreference'
import { usePrivateBookingSlotData } from '@/hooks/usePrivateBookingSlotData'
import type { TimeSlot } from '../utils/types'
import { useEffect } from 'react'

interface UsePrivateBookingProps {
  events: any[]
  stores: any[]
  scenarioId: string
  scenario?: any
  organizationSlug?: string
  organizationId?: string
  isCustomHoliday?: (date: string) => boolean
  isActive?: boolean
}

export function usePrivateBooking({ stores, scenarioId, scenario, organizationId, isCustomHoliday, isActive = true }: UsePrivateBookingProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [savedStoreIds, setSavedStoreIds] = usePrivateBookingStorePreference()
  const [storeFilterIds] = useStoreFilterPreference([])
  const [selectedStoreIds, setSelectedStoreIdsInternal] = useState<string[]>(savedStoreIds)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const MAX_SELECTIONS = 6
  const MAX_FUTURE_DAYS = 180

  // 店舗選択変更時に選択済みスロットの再検証が必要かどうかのフラグ
  const needsSlotRevalidationRef = useRef(false)

  const setSelectedStoreIds = useCallback((storeIds: string[] | ((prev: string[]) => string[])) => {
    setSelectedStoreIdsInternal(prev => {
      const newIds = typeof storeIds === 'function' ? storeIds(prev) : storeIds
      setSavedStoreIds(newIds)
      // 店舗リストが実際に変わった場合のみ再検証フラグを立てる
      const changed =
        newIds.length !== prev.length || newIds.some(id => !prev.includes(id))
      if (changed) needsSlotRevalidationRef.current = true
      return newIds
    })
  }, [setSavedStoreIds])

  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    if (stores.length > 0 && !hasInitialized) {
      setHasInitialized(true)

      const scenarioAvailableStores = scenario?.available_stores || scenario?.available_stores_ids
      const hasScenarioStoreLimit = Array.isArray(scenarioAvailableStores) && scenarioAvailableStores.length > 0

      const validStores = stores.filter(s =>
        s.ownership_type !== 'office' &&
        s.status === 'active' &&
        !s.is_temporary &&
        (hasScenarioStoreLimit
          ? scenarioAvailableStores.includes(s.id)
          : true)
      )

      const allValidIds = validStores.map(s => s.id)
      setSelectedStoreIdsInternal(allValidIds)
      setSavedStoreIds(allValidIds)
    }
  }, [stores, savedStoreIds, storeFilterIds, hasInitialized, setSavedStoreIds, scenario])

  const scenarioMasterId = scenario?.scenario_master_id || scenario?.scenario_id || scenario?.id || scenarioId

  const { loading: isLoadingEvents, computeSlotsByDate } = usePrivateBookingSlotData({
    organizationId: organizationId || '',
    scenarioId: scenarioMasterId,
    storeIds: selectedStoreIds,
    isActive: isActive && !!organizationId,
    isCustomHoliday: isCustomHoliday ?? (() => false),
    privateBookingTimeSlots: scenario?.private_booking_time_slots,
  })

  const getTimeSlotsForDate = useCallback((date: string): TimeSlot[] => {
    const result = computeSlotsByDate([date])
    const slots = result[date] || []
    return slots.map(s => ({ label: s.label, startTime: s.startTime, endTime: s.endTime }))
  }, [computeSlotsByDate])

  // 店舗変更後にローディングが完了したら、選択済みスロットを再検証する。
  // 店舗が変わると利用可能な時刻や枠自体が変わるため、古い時刻のまま送信されるのを防ぐ。
  useEffect(() => {
    if (isLoadingEvents) return
    if (!needsSlotRevalidationRef.current) return
    needsSlotRevalidationRef.current = false

    setSelectedTimeSlots(prev => {
      if (prev.length === 0) return prev
      const updated = prev.map(ts => {
        const slots = computeSlotsByDate([ts.date])[ts.date] || []
        const match = slots.find(s => s.label === ts.slot.label)
        if (!match) return null
        return { ...ts, slot: { label: match.label, startTime: match.startTime, endTime: match.endTime } }
      })
      const filtered = updated.filter((ts): ts is NonNullable<typeof ts> => ts !== null)
      const removedCount = prev.length - filtered.length
      if (removedCount > 0) {
        showToast.warning(`店舗変更により候補日時 ${removedCount}件 が選択不可になったため削除しました`)
      }
      return filtered
    })
  }, [isLoadingEvents, computeSlotsByDate])

  const checkTimeSlotAvailability = useCallback(async (date: string, slot: TimeSlot, _storeIds?: string[]): Promise<boolean> => {
    if (isLoadingEvents) return false
    const result = computeSlotsByDate([date])
    const slots = result[date] || []
    return slots.some(s => s.label === slot.label)
  }, [isLoadingEvents, computeSlotsByDate])

  const generatePrivateDates = useCallback(() => {
    const dates: string[] = []
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const lastDay = new Date(year, month + 1, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(today.getDate() + MAX_FUTURE_DAYS)

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day)
      if (date >= today && date <= maxDate) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        dates.push(dateStr)
      }
    }

    return dates
  }, [currentMonth])

  const changeMonth = useCallback((offset: number) => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(currentMonth.getMonth() + offset)
    setCurrentMonth(newMonth)
  }, [currentMonth])

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
        showToast.warning(`最大${MAX_SELECTIONS}枠まで選択できます`)
      }
    }
  }, [selectedTimeSlots])

  const availableStores = useMemo(() => {
    const scenarioAvailableStores = scenario?.available_stores || scenario?.available_stores_ids
    const hasScenarioStoreLimit = Array.isArray(scenarioAvailableStores) && scenarioAvailableStores.length > 0

    return stores.filter(s =>
      s.ownership_type !== 'office' &&
      s.status === 'active' &&
      !s.is_temporary &&
      (hasScenarioStoreLimit
        ? scenarioAvailableStores.includes(s.id)
        : true)
    )
  }, [scenario, stores])

  const isNextMonthDisabled = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(today.getDate() + MAX_FUTURE_DAYS)
    const nextMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    return nextMonthStart > maxDate
  }, [currentMonth])

  return {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    availableStores,
    isNextMonthDisabled,
    isLoadingEvents,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot,
    getTimeSlotsForDate
  }
}
