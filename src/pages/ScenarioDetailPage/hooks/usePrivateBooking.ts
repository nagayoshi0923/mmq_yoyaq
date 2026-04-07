import { useState, useCallback, useEffect, useMemo } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { usePrivateBookingStorePreference, useStoreFilterPreference } from '@/hooks/useUserPreference'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import {
  getPerformanceDurationMinutesForDate,
  PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES,
} from '@/lib/privateBookingScenarioTime'
import { timeStrToMinutes } from '@/lib/privateBookingSlotAvailability'
import { type BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import {
  getPrivateBookingStoreSlotFeasibility,
  isProposedPrivateBookingStartFeasible,
  PRIVATE_BOOKING_DAY_END_MINUTES,
} from '@/lib/privateBookingStoreSlotFeasibility'
import { computePrivateBookingSlots } from '@/lib/computePrivateBookingSlots'
import type { TimeSlot, EventSchedule } from '../utils/types'

interface UsePrivateBookingProps {
  events: EventSchedule[]
  stores: any[]
  scenarioId: string
  scenario?: any // シナリオデータ（available_storesを含む）
  organizationSlug?: string // 組織slug（マルチテナント対応）
  isCustomHoliday?: (date: string) => boolean // カスタム休日判定（GW、年末年始など）
  isActive?: boolean // 貸切タブがアクティブかどうか（遅延ロード用）
}

/**
 * 貸切リクエスト関連のロジックを管理するフック
 */
export function usePrivateBooking({ events, stores, scenarioId, scenario, organizationSlug, isCustomHoliday, isActive = true }: UsePrivateBookingProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  // 店舗選択をアカウントごとに記憶
  const [savedStoreIds, setSavedStoreIds] = usePrivateBookingStorePreference()
  // カレンダー/リストで選択した店舗をフォールバックとして使用
  const [storeFilterIds] = useStoreFilterPreference([])
  const [selectedStoreIds, setSelectedStoreIdsInternal] = useState<string[]>(savedStoreIds)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  // 営業時間設定のキャッシュ（店舗IDをキーにする）
  const [businessHoursCache, setBusinessHoursCache] = useState<Map<string, any>>(new Map())
  const MAX_SELECTIONS = 6
  
  // 店舗選択を変更し、保存する
  const setSelectedStoreIds = useCallback((storeIds: string[] | ((prev: string[]) => string[])) => {
    setSelectedStoreIdsInternal(prev => {
      const newIds = typeof storeIds === 'function' ? storeIds(prev) : storeIds
      setSavedStoreIds(newIds)
      return newIds
    })
  }, [setSavedStoreIds])
  
  // 初回フォールバック済みフラグ
  const [hasInitialized, setHasInitialized] = useState(false)
  
  // 保存された店舗選択を復元（stores読み込み後に検証）
  // 初回のみ：貸切用の選択が空の場合、カレンダー/リストの選択をフォールバック
  useEffect(() => {
    if (stores.length > 0 && !hasInitialized) {
      setHasInitialized(true)
      
      // シナリオ対応店舗のIDセット（未設定の場合は全店舗）
      const scenarioAvailableStores = scenario?.available_stores || scenario?.available_stores_ids
      const hasScenarioStoreLimit = Array.isArray(scenarioAvailableStores) && scenarioAvailableStores.length > 0
      
      // 利用可能な店舗を計算（オフィス除く、営業中のみ、シナリオ対応のみ）
      const validStores = stores.filter(s => 
        s.ownership_type !== 'office' && 
        s.status === 'active' &&
        (!hasScenarioStoreLimit || scenarioAvailableStores.includes(s.id))
      )
      
      // 1店舗しかない場合は自動選択
      if (validStores.length === 1) {
        setSelectedStoreIdsInternal([validStores[0].id])
        setSavedStoreIds([validStores[0].id])
        return
      }
      
      // 貸切用に保存された店舗がある場合はそれを使用
      if (savedStoreIds.length > 0) {
        const validStoreIds = savedStoreIds.filter(id => {
          // 店舗が存在するかチェック
          const storeExists = stores.some(s => s.id === id && s.ownership_type !== 'office')
          // シナリオ対応店舗かチェック
          const isScenarioStore = !hasScenarioStoreLimit || scenarioAvailableStores.includes(id)
          return storeExists && isScenarioStore
        })
        // 有効な保存済み店舗がある場合のみ復元
        if (validStoreIds.length > 0) {
          setSelectedStoreIdsInternal(validStoreIds)
        } else {
          // 保存済みだが全て無効な場合は、利用可能な全店舗を選択
          const allValidIds = validStores.map(s => s.id)
          setSelectedStoreIdsInternal(allValidIds)
          setSavedStoreIds(allValidIds)
        }
      } else {
        // 保存された店舗がない場合は、利用可能な全店舗を初期選択
        const allValidIds = validStores.map(s => s.id)
        setSelectedStoreIdsInternal(allValidIds)
        setSavedStoreIds(allValidIds)
      }
    }
  }, [stores, savedStoreIds, storeFilterIds, hasInitialized, setSavedStoreIds, scenario])

  // 表示中の月のイベントを取得（貸切申込可能日判定用）
  // パフォーマンス最適化: 
  // - 貸切タブがアクティブになった時のみ取得（遅延ロード）
  // - 1ヶ月ずつ取得（月が変わったら再取得）
  const [loadedMonthKey, setLoadedMonthKey] = useState<string | null>(null)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  
  useEffect(() => {
    // 貸切タブが非アクティブの場合はスキップ
    if (!isActive) return
    
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const monthKey = `${year}-${month}`
    
    // 既に読み込み済みの月はスキップ
    if (loadedMonthKey === monthKey) return
    
    const loadMonthEvents = async () => {
      setIsLoadingEvents(true)
      try {
        // organizationSlugからorganization_idを取得
        let orgId: string | undefined = undefined
        if (organizationSlug) {
          const orgData = await resolveOrganizationFromPathSegment(organizationSlug, {
            requireActive: true,
          })
          if (orgData) {
            orgId = orgData.id
          }
        }
        
        // 表示中の月のみ取得（公開ページなので確定貸切予約のクエリはスキップ）
        const events = await scheduleApi.getByMonth(year, month, orgId, false, true)
        
        // キャンセルされたイベントは除外
        const validEvents = events.filter((event: any) => !event.is_cancelled)
        
        setAllStoreEvents(validEvents)
        setLoadedMonthKey(monthKey)
      } catch (error) {
        logger.error('イベントの取得エラー:', error)
        setAllStoreEvents([])
      } finally {
        setIsLoadingEvents(false)
      }
    }
    
    loadMonthEvents()
  }, [organizationSlug, isActive, currentMonth, loadedMonthKey])

  // 営業時間設定を一括で取得してキャッシュ
  useEffect(() => {
    const loadBusinessHours = async () => {
      if (stores.length === 0) return
      
      try {
        // 全店舗の営業時間設定を一括取得
        const storeIds = stores.map(s => s.id)
        const { data, error } = await supabase
          .from('business_hours_settings')
          .select('store_id, opening_hours, holidays, special_open_days, special_closed_days')
          .in('store_id', storeIds)
        
        if (error) {
          logger.error('営業時間設定一括取得エラー:', error)
          // エラーでも続行（デフォルト設定を適用）
        }
        
        // キャッシュに保存
        const cache = new Map<string, any>()
        if (data) {
          for (const setting of data) {
            cache.set(setting.store_id, setting)
          }
        }
        setBusinessHoursCache(cache)
      } catch (error) {
        logger.error('営業時間設定読み込みエラー:', error)
      }
    }
    
    loadBusinessHours()
  }, [stores])

  // そのシナリオを公演可能な店舗IDを取得（シナリオのavailable_stores設定から）
  // オフィス（ownership_type='office'）と一時休業店舗は貸切リクエストの対象外
  const getAvailableStoreIds = useCallback((): Set<string> => {
    // オフィスを除外し、営業中の店舗のみ
    const validStores = stores.filter(s => 
      s.ownership_type !== 'office' && 
      s.status === 'active'
    )
    
    // シナリオにavailable_storesが設定されている場合のみ、その店舗に限定
    if (scenario) {
      const availableStores = scenario.available_stores || scenario.available_stores_ids
      // 配列が存在し、かつ空でない場合のみ限定
      if (Array.isArray(availableStores) && availableStores.length > 0) {
        // オフィスを除外し営業中の店舗で、シナリオのavailable_storesと一致する店舗のみ
        const resolved = availableStores.filter((id) => validStores.some((s) => s.id === id))
        // 削除済み店舗IDのみなどで空になると、店舗未選択時 checkTimeSlotAvailability が常に false になる
        if (resolved.length === 0) {
          logger.warn(
            '貸切: シナリオの available_stores が有効店舗と1件も一致しません。フォールバックで全有効店舗を対象にします。'
          )
          return new Set(validStores.map((s) => s.id))
        }
        return new Set(resolved)
      }
    }
    
    // 設定されていない場合、または空配列の場合は全店舗を対象（オフィス除く、営業中のみ）
    return new Set(validStores.map(s => s.id))
  }, [scenario, stores])
  
  // 時間枠のラベル（朝/昼/夜 または 朝公演/昼公演/夜公演 または 午前/午後/夜）を実際の時間帯（morning/afternoon/evening）にマッピング
  const getTimeSlotFromLabel = useCallback((label: string): 'morning' | 'afternoon' | 'evening' => {
    if (label === '朝' || label === '朝公演' || label === '午前') return 'morning'
    if (label === '昼' || label === '昼公演' || label === '午後') return 'afternoon'
    if (label === '夜' || label === '夜公演') return 'evening'
    return 'morning' // デフォルト
  }, [])

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

  // デフォルトの公演枠設定（設定がない場合に使用）
  // 平日も morning を含める（長時間作品で逆算が午前に食い込む場合に使う）
  const getDefaultAvailableSlots = useCallback(
    (_dayOfWeek: number, _date?: string): ('morning' | 'afternoon' | 'evening')[] =>
      ['morning', 'afternoon', 'evening'],
    []
  )

  // 営業時間内かどうかをチェックする関数（キャッシュを使用）
  // timeSlot: 'morning' | 'afternoon' | 'evening' - 公演枠
  const isWithinBusinessHours = useCallback((date: string, startTime: string, storeId: string, timeSlot?: 'morning' | 'afternoon' | 'evening'): boolean => {
    const targetDate = date.split('T')[0] // YYYY-MM-DD形式に統一
    const dayOfWeek = new Date(date).getDay() // 0=日曜日, 1=月曜日, ...
    
    // キャッシュから営業時間設定を取得
    const data = businessHoursCache.get(storeId)
    
    // 設定がない場合はデフォルトの公演枠設定を適用
    if (!data) {
      if (timeSlot) {
        const defaultSlots = getDefaultAvailableSlots(dayOfWeek, targetDate)
        return defaultSlots.includes(timeSlot)
      }
      return true
    }
    
    // 特別休業日チェック（優先度最高）
    if (data.special_closed_days && Array.isArray(data.special_closed_days)) {
      const isSpecialClosed = data.special_closed_days.some(
        (d: { date: string }) => d.date === targetDate
      )
      if (isSpecialClosed) return false
    }
    
    // 特別営業日チェック（通常休業日でも営業、全公演枠OK）
    if (data.special_open_days && Array.isArray(data.special_open_days)) {
      const isSpecialOpen = data.special_open_days.some(
        (d: { date: string }) => d.date === targetDate
      )
      if (isSpecialOpen) return true // 特別営業日なら全チェックをスキップ
    }
    
    // 旧形式の休日チェック（後方互換性）
    if (data.holidays && data.holidays.includes(targetDate)) {
      return false
    }
    
    // カスタム休日・祝日かどうか判定
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(targetDate) || isCustomHoliday?.(targetDate)
    
    // 曜日ごとの営業時間・公演枠チェック
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    // カスタム休日・祝日の場合は日曜日の設定を参照（休日扱い）
    const effectiveDayName = isWeekendOrHoliday && dayOfWeek !== 0 && dayOfWeek !== 6
      ? 'sunday'
      : dayNames[dayOfWeek]
    
    if (data.opening_hours) {
      const dayHours = data.opening_hours[effectiveDayName]
      if (!dayHours || !dayHours.is_open) {
        // カスタム休日・祝日の場合で日曜日が休業でも、元の曜日が営業なら営業とする
        if (isWeekendOrHoliday && effectiveDayName === 'sunday') {
          const originalDayHours = data.opening_hours[dayNames[dayOfWeek]]
          if (!originalDayHours || !originalDayHours.is_open) {
            return false // 元の曜日も休業
          }
          // 元の曜日は営業中、カスタム休日として朝公演を含めて許可
          if (timeSlot === 'morning') {
            return true // カスタム休日なので朝公演OK
          }
        } else {
          return false // その曜日は休業
        }
      }
      
      // 公演枠チェック（available_slotsが設定されている場合）
      // 貸切予約では朝・夜は常に許可（長時間作品の開始枠として必要）
      if (timeSlot && dayHours?.available_slots && Array.isArray(dayHours.available_slots)) {
        if (timeSlot === 'morning' || timeSlot === 'evening') {
          return true
        }
        if (!dayHours.available_slots.includes(timeSlot)) {
          return false // この公演枠は受付不可
        }
      } else if (timeSlot) {
        // available_slotsが設定されていない場合はデフォルトを適用
        const defaultSlots = getDefaultAvailableSlots(dayOfWeek, targetDate)
        if (!defaultSlots.includes(timeSlot)) {
          return false
        }
      }
    } else if (timeSlot) {
      // opening_hoursがない場合もデフォルトを適用
      const defaultSlots = getDefaultAvailableSlots(dayOfWeek, targetDate)
      if (!defaultSlots.includes(timeSlot)) {
        return false
      }
    }
    
    return true
  }, [businessHoursCache, getDefaultAvailableSlots, isCustomHoliday])

  // 特定の日付と時間枠が空いているかチェック（店舗フィルター対応）
  // 全店舗のイベントを使用して判定（特定シナリオのイベントのみではない）
  // そのシナリオを公演可能な店舗のみを対象とする
  // スケジュール管理側の営業時間設定も考慮する（同期）
  const checkTimeSlotAvailability = useCallback(async (date: string, slot: TimeSlot, storeIds?: string[]): Promise<boolean> => {
    const availableStoreIds = getAvailableStoreIds()
    
    // 店舗データがまだ読み込まれていない場合は、とりあえずtrueを返す（後で再評価される）
    if (stores.length === 0) return true
    
    // allStoreEventsがまだ読み込まれていない場合は、trueを返す（後で再評価される）
    if (allStoreEvents.length === 0) {
      return true
    }
    
    // getTimeSlotsForDate と同一: privateBookingStoreSlotFeasibility（設定の営業時間＋公演隙間）
    const checkStoreAvailability = (storeId: string): boolean => {
      const targetTimeSlot = getTimeSlotFromLabel(slot.label)
      const targetDate = date.split('T')[0]
      const holidayFn = isCustomHoliday ?? (() => false)

      const row = businessHoursCache.get(storeId) as BusinessHoursSettingRow | undefined
      const explicitCount = storeIds?.length ?? 0
      const allowSynthetic = explicitCount === 1

      const f = getPrivateBookingStoreSlotFeasibility(
        targetDate,
        storeId,
        targetTimeSlot,
        row,
        allStoreEvents,
        holidayFn,
        allowSynthetic
      )
      if (!f) return false

      if (!isWithinBusinessHours(date, slot.startTime, storeId, targetTimeSlot)) {
        return false
      }

      const startMin = timeStrToMinutes(slot.startTime)
      if (startMin === null) return false

      const durationMinutes = getPerformanceDurationMinutesForDate(
        targetDate,
        {
          duration: typeof scenario?.duration === 'number' && scenario.duration > 0 ? scenario.duration : 180,
          weekend_duration:
            typeof scenario?.weekend_duration === 'number' && scenario.weekend_duration > 0
              ? scenario.weekend_duration
              : null,
        },
        holidayFn
      )
      const extraPrepTime = scenario?.extra_preparation_time || 0

      const dayOfWeek = new Date(targetDate).getDay()
      const isWeekendOrHolidayForAvail =
        dayOfWeek === 0 ||
        dayOfWeek === 6 ||
        isJapaneseHoliday(targetDate) ||
        holidayFn(targetDate)
      let effectiveMinStartMin: number | undefined = undefined

      if (targetTimeSlot === 'evening' && startMin < f.slotBandStart) {
        // 長時間作品の夜枠: 枠開始前からの開始を許可するが前の公演との衝突は防ぐ
        let latestPriorEndWithBuffer = 0
        for (const e of allStoreEvents) {
          const ed = e.date ? String(e.date).split('T')[0] : ''
          if (ed !== targetDate) continue
          const sid = e.store_id ?? e.stores?.id ?? null
          if (sid !== storeId) continue
          if (!e.start_time) continue
          const eStart = timeStrToMinutes(String(e.start_time))
          if (eStart === null || eStart > startMin) continue
          const eEnd = e.end_time ? (timeStrToMinutes(String(e.end_time)) ?? eStart + 240) : eStart + 240
          const endBuf = eEnd + 60
          if (endBuf > latestPriorEndWithBuffer) latestPriorEndWithBuffer = endBuf
        }
        effectiveMinStartMin = latestPriorEndWithBuffer
      }

      // 平日午後: 夜公演前の60分バッファを確保
      // 夜枠: 最終枠のため準備時間は営業終了後に延長可能
      let occupancyEndOverride: number | undefined
      if (targetTimeSlot === 'afternoon' && !isWeekendOrHolidayForAvail) {
        occupancyEndOverride = f.slotBandEnd - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
      } else if (startMin + durationMinutes + extraPrepTime > f.slotBandEnd) {
        occupancyEndOverride = PRIVATE_BOOKING_DAY_END_MINUTES + (targetTimeSlot === 'evening' ? extraPrepTime : 0)
      }

      return isProposedPrivateBookingStartFeasible(
        f,
        startMin,
        durationMinutes,
        extraPrepTime,
        {
          targetDateYmd: targetDate,
          storeId,
          dayEvents: allStoreEvents,
        },
        effectiveMinStartMin,
        occupancyEndOverride
      )
    }
    
    // 店舗が選択されている場合：選択された店舗のいずれかで空きがあればtrue
    if (storeIds && storeIds.length > 0) {
      const validStoreIds = storeIds.filter(storeId => 
        availableStoreIds.size === 0 || availableStoreIds.has(storeId)
      )
      if (validStoreIds.length === 0) return false
      
      return validStoreIds.some(storeId => checkStoreAvailability(storeId))
    }
    
    // 店舗が選択されていない場合：営業時間設定があればそれを使用、なければデフォルト
    const targetTimeSlot = getTimeSlotFromLabel(slot.label)
    const targetDate = date.split('T')[0]
    const dayOfWeek = new Date(date).getDay()
    
    // カスタム休日・祝日かどうか判定
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(targetDate) || isCustomHoliday?.(targetDate)
    
    // キャッシュに設定があれば最初の設定を使用（全店舗共通設定として）
    let allowedSlots: ('morning' | 'afternoon' | 'evening')[] = getDefaultAvailableSlots(dayOfWeek, targetDate)
    
    if (businessHoursCache.size > 0) {
      const firstStoreId = businessHoursCache.keys().next().value as string | undefined
      const settings = firstStoreId ? businessHoursCache.get(firstStoreId) : undefined
      if (settings?.opening_hours) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        // カスタム休日・祝日の場合は日曜日の設定を参照（休日扱い）
        const effectiveDayName = isWeekendOrHoliday && dayOfWeek !== 0 && dayOfWeek !== 6
          ? 'sunday'
          : dayNames[dayOfWeek]
        const dayHours = settings.opening_hours[effectiveDayName]
        if (dayHours?.available_slots && dayHours.available_slots.length > 0) {
          allowedSlots = dayHours.available_slots
          if (!allowedSlots.includes('morning')) {
            allowedSlots = ['morning', ...allowedSlots]
          }
          if (!allowedSlots.includes('evening')) {
            allowedSlots = [...allowedSlots, 'evening']
          }
        }
      }
    }
    
    // 許可されていない時間枠は無効
    if (!allowedSlots.includes(targetTimeSlot)) {
      return false
    }
    
    // いずれかの店舗で空きがあればtrue
    const availableStoreIdsArray = Array.from(availableStoreIds)
    if (availableStoreIdsArray.length === 0) return stores.length === 0
    
    return availableStoreIdsArray.some(storeId => checkStoreAvailability(storeId))
  }, [
    allStoreEvents,
    getAvailableStoreIds,
    getEventStoreId,
    getTimeSlotFromLabel,
    stores,
    isWithinBusinessHours,
    isCustomHoliday,
    businessHoursCache,
    getDefaultAvailableSlots,
    scenario,
  ])

  const MAX_FUTURE_DAYS = 180

  // 貸切リクエスト用の日付リストを生成（指定月の1ヶ月分、180日以内）
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
        showToast.warning(`最大${MAX_SELECTIONS}枠まで選択できます`)
      }
    }
  }, [selectedTimeSlots])

  const getTimeSlotsForDate = useCallback((date: string): TimeSlot[] => {
    const targetStoreIds = selectedStoreIds.length > 0
      ? selectedStoreIds
      : stores.filter((s: any) => s.ownership_type !== 'office' && s.status === 'active').map((s: any) => s.id)

    const slots = computePrivateBookingSlots({
      date,
      storeIds: targetStoreIds,
      businessHoursByStore: businessHoursCache,
      scenarioTiming: {
        duration: typeof scenario?.duration === 'number' && scenario.duration > 0 ? scenario.duration : 180,
        weekend_duration:
          typeof scenario?.weekend_duration === 'number' && scenario.weekend_duration > 0
            ? scenario.weekend_duration
            : null,
        extra_preparation_time: scenario?.extra_preparation_time || 0,
      },
      allStoreEvents,
      isCustomHoliday: isCustomHoliday ?? (() => false),
      privateBookingTimeSlots: scenario?.private_booking_time_slots,
    })

    return slots.map(s => ({ label: s.label, startTime: s.startTime, endTime: s.endTime }))
  }, [selectedStoreIds, businessHoursCache, scenario, allStoreEvents, stores, isCustomHoliday])

  // シナリオが対応している店舗のみにフィルタリングした店舗リスト
  const availableStores = useMemo(() => {
    // オフィスを除外し、営業中の店舗のみ
    const validStores = stores.filter(s => 
      s.ownership_type !== 'office' && 
      s.status === 'active'
    )
    
    // シナリオにavailable_storesが設定されている場合のみ、その店舗に限定
    if (scenario) {
      const scenarioAvailableStores = scenario.available_stores || scenario.available_stores_ids
      // 配列が存在し、かつ空でない場合のみ限定
      if (Array.isArray(scenarioAvailableStores) && scenarioAvailableStores.length > 0) {
        return validStores.filter(s => scenarioAvailableStores.includes(s.id))
      }
    }
    
    // 設定されていない場合、または空配列の場合は全店舗を対象（オフィス除く、営業中のみ）
    return validStores
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

