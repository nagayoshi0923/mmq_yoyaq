// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { useState, useCallback, useMemo } from 'react'
import { showToast } from '@/utils/toast'
import { usePrivateBookingStorePreference, useStoreFilterPreference } from '@/hooks/useUserPreference'
import { useCandidateSlotAvailability } from '@/hooks/useCandidateSlotAvailability'
import { availableSlotsForDate } from '@/lib/candidateSlotAvailability'
import type { TimeSlot } from '../utils/types'
import { useEffect } from 'react'

interface UsePrivateBookingProps {
  events: any[]
  stores: any[]
  scenarioId: string
  scenario?: any
  organizationSlug?: string
  organizationId?: string
  /** 互換のため受け取る（空き判定は DB で行うため使わない） */
  isCustomHoliday?: (date: string) => boolean
  isActive?: boolean
}

export function usePrivateBooking({ stores, scenarioId, scenario, organizationId, isActive = true }: UsePrivateBookingProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [savedStoreIds, setSavedStoreIds] = usePrivateBookingStorePreference()
  const [storeFilterIds] = useStoreFilterPreference([])
  const [selectedStoreIds, setSelectedStoreIdsInternal] = useState<string[]>(savedStoreIds)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const MAX_SELECTIONS = 6
  const MAX_FUTURE_DAYS = 180

  const setSelectedStoreIds = useCallback((storeIds: string[] | ((prev: string[]) => string[])) => {
    setSelectedStoreIdsInternal(prev => {
      const newIds = typeof storeIds === 'function' ? storeIds(prev) : storeIds
      setSavedStoreIds(newIds)
      return newIds
    })
  }, [setSavedStoreIds])

  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    if (stores.length > 0 && !hasInitialized) {
      setHasInitialized(true)

      const rawAvailableStores = scenario?.available_stores || scenario?.available_stores_ids
      // slug が未設定の場合、別組織のシナリオが返ることがある。
      // その場合 available_stores は参照組織のものなので無視する（全店舗対応扱い）
      const isCrossOrg = organizationId && scenario?.organization_id && scenario.organization_id !== organizationId
      const scenarioAvailableStores = isCrossOrg ? [] : rawAvailableStores
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

  // 表示中の月の日付（generatePrivateDates の結果を安定化）
  const monthDates = useMemo(() => generatePrivateDates(), [generatePrivateDates])

  // 空き判定は DB（グループの候補日保存と同じ判定）。画面では計算しない
  const storeIdsKey = [...selectedStoreIds].sort().join(',')
  const availabilityTarget = useMemo(() => (
    isActive && organizationId && scenarioMasterId && storeIdsKey
      ? { kind: 'scenario' as const, organizationId, scenarioId: scenarioMasterId, storeIds: storeIdsKey.split(',') }
      : null
  ), [isActive, organizationId, scenarioMasterId, storeIdsKey])
  const {
    availability: slotAvailability,
    loading: isLoadingEvents,
    ready: canRevalidate,
  } = useCandidateSlotAvailability(availabilityTarget, monthDates)

  const getTimeSlotsForDate = useCallback((date: string): TimeSlot[] => (
    availableSlotsForDate(slotAvailability, date).map(s => ({ label: s.label, startTime: s.startTime, endTime: s.endTime }))
  ), [slotAvailability])

  // 空き状況の読み直し後に、表示中の月の選択済み候補を再検証する（時刻の更新・選べなくなった枠の削除）。
  useEffect(() => {
    if (isLoadingEvents || !canRevalidate) return

    setSelectedTimeSlots(prev => {
      if (prev.length === 0) return prev
      const updated = prev.map(ts => {
        if (!slotAvailability.slotsByDate[ts.date]) return ts
        const match = availableSlotsForDate(slotAvailability, ts.date).find(s => s.label === ts.slot.label)
        if (!match) return null
        return { ...ts, slot: { label: match.label, startTime: match.startTime, endTime: match.endTime } }
      })
      const filtered = updated.filter((ts): ts is NonNullable<typeof ts> => ts !== null)
      const removedCount = prev.length - filtered.length
      if (removedCount > 0) {
        showToast.warning(`受付条件の変更により候補日時 ${removedCount}件 が選択不可になったため削除しました`)
      }
      return JSON.stringify(filtered) === JSON.stringify(prev) ? prev : filtered
    })
  }, [isLoadingEvents, canRevalidate, slotAvailability])

  /** 指定日の月を表示する（URL からの事前選択用） */
  const showMonthOf = useCallback((date: string) => {
    const [y, m] = date.split('-').map(Number)
    setCurrentMonth(prev => (prev.getFullYear() === y && prev.getMonth() === m - 1 ? prev : new Date(y, m - 1, 1)))
  }, [])

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
    const rawAvailableStores = scenario?.available_stores || scenario?.available_stores_ids
    const isCrossOrg = organizationId && scenario?.organization_id && scenario.organization_id !== organizationId
    const scenarioAvailableStores = isCrossOrg ? [] : rawAvailableStores
    const hasScenarioStoreLimit = Array.isArray(scenarioAvailableStores) && scenarioAvailableStores.length > 0

    return stores.filter(s =>
      s.ownership_type !== 'office' &&
      s.status === 'active' &&
      !s.is_temporary &&
      (hasScenarioStoreLimit
        ? scenarioAvailableStores.includes(s.id)
        : true)
    )
  }, [scenario, stores, organizationId])

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
    isAvailabilityReady: canRevalidate,
    slotAvailability,
    monthDates,
    showMonthOf,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    changeMonth,
    toggleTimeSlot,
    getTimeSlotsForDate
  }
}
