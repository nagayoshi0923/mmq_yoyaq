import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { fetchScenarioTimingFromDb, type ScenarioTimingFromDb } from '@/lib/privateBookingScenarioTime'
import { computePrivateBookingSlots, type PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'

interface UsePrivateBookingSlotDataOptions {
  organizationId: string
  scenarioId: string
  storeIds: string[]
  isActive: boolean
  isCustomHoliday: (date: string) => boolean
  privateBookingTimeSlots?: string[]
}

interface UsePrivateBookingSlotDataResult {
  effectiveStoreIds: string[]
  businessHoursByStore: Map<string, BusinessHoursSettingRow>
  allStoreEvents: any[]
  scenarioTiming: ScenarioTimingFromDb | null
  loading: boolean
  computeSlotsByDate: (dates: string[]) => Record<string, PrivateBookingSlot[]>
}

export function usePrivateBookingSlotData({
  organizationId,
  scenarioId,
  storeIds,
  isActive,
  isCustomHoliday,
  privateBookingTimeSlots,
}: UsePrivateBookingSlotDataOptions): UsePrivateBookingSlotDataResult {
  const [fallbackStoreIds, setFallbackStoreIds] = useState<string[]>([])
  const [fallbackLoading, setFallbackLoading] = useState(false)
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  const [businessHoursByStore, setBusinessHoursByStore] = useState<Map<string, BusinessHoursSettingRow>>(new Map())
  const [scenarioTiming, setScenarioTiming] = useState<ScenarioTimingFromDb | null>(null)
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [businessHoursLoaded, setBusinessHoursLoaded] = useState(false)
  const [scenarioTimingLoaded, setScenarioTimingLoaded] = useState(false)

  const effectiveStoreIds = storeIds.length > 0 ? storeIds : fallbackStoreIds

  // Store fallback: when no stores specified, load all active stores for the org
  useEffect(() => {
    if (storeIds.length > 0 || !isActive) {
      setFallbackStoreIds([])
      setFallbackLoading(false)
      return
    }
    let cancelled = false
    setFallbackLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase
          .from('stores')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .or('is_temporary.is.null,is_temporary.eq.false')
          .neq('ownership_type', 'office')
        if (!cancelled && data) {
          setFallbackStoreIds(data.map(s => s.id))
        }
      } catch {
        if (!cancelled) setFallbackStoreIds([])
      } finally {
        if (!cancelled) setFallbackLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [storeIds, isActive, organizationId])

  // Load events + business hours when active and stores are available
  useEffect(() => {
    if (!isActive) {
      setEventsLoaded(false)
      setBusinessHoursLoaded(false)
      return
    }
    if (effectiveStoreIds.length === 0) {
      setAllStoreEvents([])
      setBusinessHoursByStore(new Map())
      setEventsLoaded(true)
      setBusinessHoursLoaded(true)
      return
    }

    let cancelled = false

    const loadEvents = async () => {
      setEventsLoading(true)
      setEventsLoaded(false)
      try {
        const today = new Date()
        const windowEnd = new Date(today)
        windowEnd.setDate(today.getDate() + 180)

        const { data, error } = await supabase
          .from('schedule_events')
          .select('id, date, store_id, start_time, end_time, is_cancelled, stores(id, name)')
          .in('store_id', effectiveStoreIds)
          .gte('date', today.toISOString().split('T')[0])
          .lte('date', windowEnd.toISOString().split('T')[0])
          .eq('is_cancelled', false)

        if (error) throw error
        if (!cancelled) {
          setAllStoreEvents(data || [])
          setEventsLoaded(true)
        }
      } catch (err) {
        logger.error('Failed to load events', err)
        if (!cancelled) {
          setAllStoreEvents([])
          setEventsLoaded(true)
        }
      } finally {
        if (!cancelled) setEventsLoading(false)
      }
    }

    const loadBusinessHours = async () => {
      setBusinessHoursLoaded(false)
      try {
        const { data, error } = await supabase
          .from('business_hours_settings')
          .select('store_id, opening_hours, holidays, special_open_days, special_closed_days')
          .in('store_id', effectiveStoreIds)

        if (error) throw error
        if (!cancelled) {
          const m = new Map<string, BusinessHoursSettingRow>()
          for (const row of data || []) {
            m.set(row.store_id, row as BusinessHoursSettingRow)
          }
          setBusinessHoursByStore(m)
          setBusinessHoursLoaded(true)
        }
      } catch (err) {
        logger.error('Failed to load business hours', err)
        if (!cancelled) {
          setBusinessHoursByStore(new Map())
          setBusinessHoursLoaded(true)
        }
      }
    }

    loadEvents()
    loadBusinessHours()

    return () => { cancelled = true }
  }, [isActive, effectiveStoreIds])

  // Load scenario timing
  useEffect(() => {
    if (!isActive) return
    if (!organizationId || !scenarioId) {
      setScenarioTiming(null)
      setScenarioTimingLoaded(true)
      return
    }
    let cancelled = false
    setScenarioTimingLoaded(false)
    ;(async () => {
      try {
        const t = await fetchScenarioTimingFromDb(supabase, {
          organizationId,
          scenarioLookupId: scenarioId,
          scenarioMasterId: scenarioId,
        })
        if (!cancelled) setScenarioTiming(t)
      } catch (e) {
        logger.error('Failed to load scenario timing', e)
        if (!cancelled) setScenarioTiming(null)
      } finally {
        if (!cancelled) setScenarioTimingLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [isActive, organizationId, scenarioId])

  const loading = fallbackLoading || eventsLoading || !eventsLoaded || !businessHoursLoaded || !scenarioTimingLoaded

  const resolvedTimeSlots = privateBookingTimeSlots ?? scenarioTiming?.private_booking_time_slots ?? undefined

  const computeSlotsByDate = useMemo(() => {
    return (dates: string[]): Record<string, PrivateBookingSlot[]> => {
      if (!scenarioTiming) return {} as Record<string, PrivateBookingSlot[]>
      const map: Record<string, PrivateBookingSlot[]> = {}
      for (const date of dates) {
        map[date] = computePrivateBookingSlots({
          date,
          storeIds: effectiveStoreIds,
          businessHoursByStore,
          scenarioTiming,
          allStoreEvents,
          isCustomHoliday,
          privateBookingTimeSlots: resolvedTimeSlots,
        })
      }
      return map
    }
  }, [effectiveStoreIds, businessHoursByStore, scenarioTiming, allStoreEvents, isCustomHoliday, resolvedTimeSlots])

  return {
    effectiveStoreIds,
    businessHoursByStore,
    allStoreEvents,
    scenarioTiming,
    loading,
    computeSlotsByDate,
  }
}
