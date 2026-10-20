// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { useState, useCallback, useMemo } from 'react'
import { showToast } from '@/utils/toast'
import { usePrivateBookingStorePreference, useStoreFilterPreference } from '@/hooks/useUserPreference'
import { useCandidateSlotAvailability } from '@/hooks/useCandidateSlotAvailability'
import { availableSlotsForDate } from '@/lib/candidateSlotAvailability'
import { isStorePlayableForScenario } from '@/lib/scenarioStoreHint'
import type { TimeSlot } from '../utils/types'
import { useEffect } from 'react'
import { privateBookingHorizonMaxYmd, usePrivateBookingHorizonDays } from '@/lib/privateBookingHorizon'
import { toJstYmd } from '@/utils/jstDate'

/**
 * この作品の貸切を受け付ける店舗（DB の判定と同じ。上演店舗の指定があればその店舗、無ければ臨時会場以外）。
 * slug が未設定の場合、別組織のシナリオが返ることがある。その場合 available_stores は参照組織のものなので無視する（全店舗対応扱い）
 */
function playableStores(stores: any[], scenario: any, organizationId: string | undefined): any[] {
  const rawAvailableStores = scenario?.available_stores || scenario?.available_stores_ids
  const isCrossOrg = organizationId && scenario?.organization_id && scenario.organization_id !== organizationId
  const scenarioAvailableStores: string[] = !isCrossOrg && Array.isArray(rawAvailableStores) ? rawAvailableStores : []
  return stores.filter(s => s.status === 'active' && isStorePlayableForScenario(s, scenarioAvailableStores))
}

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

      const allValidIds = playableStores(stores, scenario, organizationId).map(s => s.id)
      setSelectedStoreIdsInternal(allValidIds)
      setSavedStoreIds(allValidIds)
    }
  }, [stores, savedStoreIds, storeFilterIds, hasInitialized, setSavedStoreIds, scenario, organizationId])

  const scenarioMasterId = scenario?.scenario_master_id || scenario?.scenario_id || scenario?.id || scenarioId
  // 申し込める範囲（今日から N 日先まで。MMQ 既定 180 → 組織 → 作品の設定。I21）。判定の正本は DB
  // 読めるまで（読めなかったときも）は days が null で、どの日も出さない（既定の 180 日で選ばせない。Codex 点検 不具合 5）
  const horizon = usePrivateBookingHorizonDays({ organizationId: scenario?.organization_id || organizationId, scenarioId: scenarioMasterId })
  const horizonDays = horizon.days
  const horizonMaxYmd = privateBookingHorizonMaxYmd(horizonDays)

  const generatePrivateDates = useCallback(() => {
    const dates: string[] = []
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const lastDay = new Date(year, month + 1, 0)
    const todayYmd = toJstYmd(new Date())

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (dateStr >= todayYmd && dateStr <= horizonMaxYmd) dates.push(dateStr)
    }

    return dates
  }, [currentMonth, horizonMaxYmd])

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
    error: availabilityError,
    reload: reloadAvailability,
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

  const availableStores = useMemo(() => playableStores(stores, scenario, organizationId), [scenario, stores, organizationId])

  const isNextMonthDisabled = useMemo(() => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    const nextMonthStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
    return nextMonthStart > horizonMaxYmd
  }, [currentMonth, horizonMaxYmd])

  return {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    availableStores,
    isNextMonthDisabled,
    isLoadingEvents,
    // 受付範囲が分からない間は、枠の選択も申込ボタンも止める
    isAvailabilityReady: canRevalidate && horizonDays !== null,
    /** 空き状況を読めなかった（通信失敗など）。「空きなし」と区別して出し、再読み込みできるようにする */
    availabilityError,
    reloadAvailability,
    /** 受付範囲（今日から何日先まで）。days が null の間は日付を出さず、確認中・再試行を出す */
    horizon,
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
