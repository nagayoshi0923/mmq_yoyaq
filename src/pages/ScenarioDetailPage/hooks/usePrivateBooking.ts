import { useState, useCallback, useEffect, useMemo } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getTimeSlot } from '@/utils/scheduleUtils' // 時間帯判定用
import { usePrivateBookingStorePreference, useStoreFilterPreference } from '@/hooks/useUserPreference'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import {
  getPerformanceDurationMinutesForDate,
  isPrivateBookingSlotAllowedByScenarioSettings,
  PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES,
} from '@/lib/privateBookingScenarioTime'
import { timeStrToMinutes } from '@/lib/privateBookingSlotAvailability'
import { type BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import {
  getPrivateBookingStoreSlotFeasibility,
  isProposedPrivateBookingStartFeasible,
  PRIVATE_BOOKING_DAY_END_MINUTES,
} from '@/lib/privateBookingStoreSlotFeasibility'
import type { TimeSlot, EventSchedule } from '../utils/types'

// 開始時間から終了時間を計算する関数
const calculateEndTime = (startTime: string, durationMinutes: number): string => {
  const [hours, minutes] = startTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes + durationMinutes
  const endHours = Math.floor(totalMinutes / 60) % 24
  const endMinutes = totalMinutes % 60
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`
}

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
      if (timeSlot && dayHours?.available_slots && Array.isArray(dayHours.available_slots)) {
        // カスタム休日・祝日で朝公演の場合は強制的に許可
        if (isWeekendOrHoliday && timeSlot === 'morning') {
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
      const effectiveMinStartMin =
        targetTimeSlot === 'afternoon' && !isWeekendOrHolidayForAvail
          ? Math.max(
              f.priorEventEarliestStartMin,
              f.slotBandEnd - durationMinutes - extraPrepTime
            )
          : undefined

      const occupancyEndOverride =
        startMin + durationMinutes + extraPrepTime > f.slotBandEnd
          ? PRIVATE_BOOKING_DAY_END_MINUTES
          : undefined

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
          // カスタム休日・祝日で朝公演がない場合は追加
          if (isWeekendOrHoliday && !allowedSlots.includes('morning')) {
            allowedSlots = ['morning', ...allowedSlots]
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

  // 日付に基づいて時間枠を取得（既存イベントのスケジュールを参照、前公演end_time + 1時間を開始時間に）
  const getTimeSlotsForDate = useCallback((date: string): TimeSlot[] => {
    const targetDate = date.split('T')[0] // YYYY-MM-DD形式に統一
    const dayOfWeek = new Date(date).getDay() // 0=日曜日, 1=月曜日, ...
    // 土日、祝日、カスタム休日は「休日」として扱う（朝公演あり、昼公演14:00開始）
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(targetDate) || isCustomHoliday?.(targetDate)

    const holidayFn = isCustomHoliday ?? (() => false)
    // 貸切グループと同じ: 土日祝は weekend_duration を優先
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

    // 選択された店舗がある場合は、その店舗の設定を使用
    // 店舗未選択時はシナリオのavailable_storesの最初の店舗を使用
    let targetStoreId = selectedStoreIds.length > 0 ? selectedStoreIds[0] : null
    
    // 店舗未選択時、シナリオのavailable_storesがあればその最初の店舗を使用
    if (!targetStoreId && scenario) {
      const scenarioStores = scenario.available_stores || scenario.available_stores_ids
      if (Array.isArray(scenarioStores) && scenarioStores.length > 0) {
        targetStoreId = scenarioStores[0]
      }
    }
    
    // それでも店舗がない場合、キャッシュの最初の設定を使用
    if (!targetStoreId && businessHoursCache.size > 0) {
      targetStoreId = (businessHoursCache.keys().next().value as string | undefined) ?? null
    }
    
    const settings = targetStoreId ? businessHoursCache.get(targetStoreId) : null
    
    // 分を時間に変換
    const minutesToTime = (minutes: number): string => {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    }
    
    // 時間を分に変換
    const timeToMinutes = (time: string): number => {
      const [h, m] = time.split(':').map(Number)
      return h * 60 + (m || 0)
    }
    
    // デフォルトの開始時間・終了時間（平日は昼13:00開始、土日祝・カスタム休日は14:00、夜公演は19:00）
    const defaultStartTimes: Record<string, number> = isWeekendOrHoliday
      ? {
          morning: timeToMinutes('10:00'),
          afternoon: timeToMinutes('14:00'),
          evening: timeToMinutes('19:00')  // 夜公演は19:00開始
        }
      : {
          morning: timeToMinutes('10:00'),
          afternoon: timeToMinutes('13:00'),  // 平日は13:00開始
          evening: timeToMinutes('19:00')  // 夜公演は19:00開始
        }
    const slotEndLimits: Record<string, number> = {
      morning: timeToMinutes('13:00'),
      afternoon: timeToMinutes('19:00'), // 昼公演は19:00まで延長可能
      evening: timeToMinutes('23:00')
    }
    
    // 営業時間設定がある場合、曜日ごとの設定を取得
    // 平日でも morning を含める（長時間作品で逆算が13時前になる場合に午前として表示するため）
    let availableSlots: ('morning' | 'afternoon' | 'evening')[] = [
      'morning',
      'afternoon',
      'evening',
    ]
    
    if (settings?.opening_hours) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      // カスタム休日・祝日の場合は日曜日の設定を参照（休日扱い）
      // 通常は実際の曜日の設定を使用
      const effectiveDayName = isWeekendOrHoliday && dayOfWeek !== 0 && dayOfWeek !== 6
        ? 'sunday'  // 祝日・カスタム休日は日曜日の設定を使用
        : dayNames[dayOfWeek]
      const dayHours = settings.opening_hours[effectiveDayName]
      
      if (dayHours) {
        // 店舗設定からは利用可能な公演枠のみを取得
        // ただし、カスタム休日・祝日の場合は朝公演を強制的に有効にする
        if (dayHours.available_slots && dayHours.available_slots.length > 0) {
          availableSlots = dayHours.available_slots
          // カスタム休日・祝日で朝公演がない場合は追加
          if (isWeekendOrHoliday && !availableSlots.includes('morning')) {
            availableSlots = ['morning', ...availableSlots]
          }
        }
        
        // 営業時間設定の公演枠開始時間を適用（slot_start_times）
        if (dayHours.slot_start_times) {
          const st = dayHours.slot_start_times
          // 値が存在し、かつ有効な時間形式の場合のみ適用
          if (st.morning && st.morning.includes(':')) defaultStartTimes.morning = timeToMinutes(st.morning)
          if (st.afternoon && st.afternoon.includes(':')) defaultStartTimes.afternoon = timeToMinutes(st.afternoon)
          if (st.evening && st.evening.includes(':')) defaultStartTimes.evening = timeToMinutes(st.evening)
        }
        
        // 営業終了時間を夜公演の上限に反映
        if (dayHours.close_time) {
          slotEndLimits.evening = timeToMinutes(dayHours.close_time)
        }
      }
    }
    
    // === 既存イベントのスケジュールを参照して開始時間を計算 ===
    // targetDateは関数冒頭で定義済み
    
    // 対象店舗のイベントを取得（選択店舗 or 全店舗）
    const targetStoreIds = selectedStoreIds.length > 0 
      ? selectedStoreIds 
      : stores.map(s => s.id)
    
    // 複数店舗: privateBookingStoreSlotFeasibility（設定の営業時間＋同日公演の隙間）に集約
    type SlotKey = 'morning' | 'afternoon' | 'evening'
    const getEarliestAvailableStartForStores = (
      slotKey: SlotKey
    ): {
      earliestStart: number
      slotEnd: number
      slotBaselineStart: number
      priorEventEarliestStartMin: number
    } | null => {
      const extraPrepTime = scenario?.extra_preparation_time || 0
      const allowSynthetic = targetStoreIds.length === 1
      const candidates: {
        earliestStart: number
        slotEnd: number
        slotBaselineStart: number
        priorEventEarliestStartMin: number
      }[] = []

      for (const storeId of targetStoreIds) {
        const row = businessHoursCache.get(storeId) as BusinessHoursSettingRow | undefined
        const f = getPrivateBookingStoreSlotFeasibility(
          targetDate,
          storeId,
          slotKey,
          row,
          allStoreEvents,
          holidayFn,
          allowSynthetic
        )
        if (!f) continue
        const startForFeasibility =
          slotKey === 'afternoon' && !isWeekendOrHoliday
            ? Math.max(
                f.priorEventEarliestStartMin,
                f.slotBandEnd - durationMinutes - extraPrepTime
              )
            : f.minAllowedStart
        const multiOccupancyOverride =
          startForFeasibility + durationMinutes + extraPrepTime > f.slotBandEnd
            ? PRIVATE_BOOKING_DAY_END_MINUTES
            : undefined

        if (
          !isProposedPrivateBookingStartFeasible(
            f,
            startForFeasibility,
            durationMinutes,
            extraPrepTime,
            {
              targetDateYmd: targetDate,
              storeId,
              dayEvents: allStoreEvents,
            },
            startForFeasibility,
            multiOccupancyOverride
          )
        ) {
          continue
        }
        candidates.push({
          earliestStart: f.minAllowedStart,
          slotEnd: f.slotBandEnd,
          slotBaselineStart: f.slotBandStart,
          priorEventEarliestStartMin: f.priorEventEarliestStartMin,
        })
      }

      if (candidates.length === 0) return null

      return candidates.reduce((a, b) => (a.earliestStart < b.earliestStart ? a : b))
    }
    
    // 単一店舗選択時のみイベントを取得（店舗未選択時・複数店舗選択時は空）
    // 店舗未選択時：まだ店舗が決まっていないので、イベント判定はスキップ（表示は楽観的になり得る）
    // 複数店舗選択時：getEarliestAvailableStartForStores で各店舗ごとに処理
    const dayEvents = selectedStoreIds.length === 1
      ? allStoreEvents
          .filter((e: any) => {
            const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
            if (eventDate !== targetDate) return false
            const eventStoreId = e.store_id || e.stores?.id
            return eventStoreId === selectedStoreIds[0]
          })
          .sort((a: any, b: any) => (a.end_time || '').localeCompare(b.end_time || ''))
      : [] // 店舗未選択 or 複数店舗選択時は空配列
    
    // 各スロットの前にあるイベントの最遅end_timeを計算
    const getLatestEndTimeBefore = (slotKey: string): number | null => {
      const precedingSlots: Record<string, string[]> = {
        morning: [],
        afternoon: ['morning'],
        evening: ['morning', 'afternoon']
      }
      const preceding = precedingSlots[slotKey] || []
      
      // 前スロットの時間範囲内にあるイベント + 現スロット開始前に終わるイベント
      const slotDefaultStart = defaultStartTimes[slotKey]
      const relevantEvents = dayEvents.filter((e: any) => {
        if (!e.end_time) return false
        const eventStart = timeToMinutes(e.start_time || '00:00')
        // 前スロットに属するイベント（開始時間がこのスロットのデフォルト開始より前）
        return eventStart < slotDefaultStart
      })
      
      if (relevantEvents.length === 0) return null
      
      // 最遅のend_timeを取得
      let latest = 0
      relevantEvents.forEach((e: any) => {
        const endMin = timeToMinutes(e.end_time)
        if (endMin > latest) latest = endMin
      })
      return latest
    }
    
    // 当日のスロット開始時間以降で最も早いイベントの開始時間を取得
    const getEarliestEventStartAfter = (afterMinutes: number): number | null => {
      let earliest: number | null = null
      dayEvents.forEach((e: any) => {
        if (!e.start_time) return
        const eventStart = timeToMinutes(e.start_time)
        if (eventStart > afterMinutes) {
          if (earliest === null || eventStart < earliest) {
            earliest = eventStart
          }
        }
      })
      return earliest
    }
    
    // このスロットの時間帯内で、公演を入れる余地があるかチェック
    // 開始可能時間を計算し、スロット終了時間までに公演が収まるかを判定
    // 重要: 同じスロット内に既にイベントがある場合は、その枠は使用不可とする
    const getSlotStartTimeConsideringEvents = (slotKey: string): number | null => {
      const slotStart = defaultStartTimes[slotKey]
      const slotEnd = slotEndLimits[slotKey]
      
      // このスロットの時間帯内にあるイベントを取得
      const eventsInSlot = dayEvents.filter((e: any) => {
        if (!e.start_time) return false
        const eventStart = timeToMinutes(e.start_time)
        const eventEnd = e.end_time ? timeToMinutes(e.end_time) : eventStart + 240
        // イベントがスロットの時間帯と重なっている場合
        return eventStart < slotEnd && eventEnd > slotStart
      })
      
      if (eventsInSlot.length === 0) {
        // スロット内にイベントがない場合は、前スロットのイベント終了+1時間と比較
        return null // 後で getLatestEndTimeBefore で計算
      }
      
      // スロット内に既にイベントがある場合は、その枠は使用不可
      // （同じ時間帯に複数の貸切リクエストを受け付けない）
      return -1 // 使用不可
    }
    
    // 時間枠を生成（有効な公演枠のみ）
    // ラベルはデータベース制約 ('午前', '午後', '夜') と一致させる
    const slotDefinitions: { key: 'morning' | 'afternoon' | 'evening'; label: string }[] = [
      { key: 'morning', label: '午前' },
      { key: 'afternoon', label: '午後' },
      { key: 'evening', label: '夜' }
    ]
    const hardDayLimit = timeToMinutes('23:00')
    
    return slotDefinitions
      .filter(def => availableSlots.includes(def.key))
      .map(def => {
        let effectiveSlotEndLimit = slotEndLimits[def.key]
        let eveningConfiguredStart = defaultStartTimes[def.key]
        const extraPrepTime = scenario?.extra_preparation_time || 0
        let startMinutes: number
        let earliestPossibleStart: number = defaultStartTimes[def.key] // 前公演考慮後の最早開始時間
        let multiStoreFeasibility: {
          earliestStart: number
          slotEnd: number
          slotBaselineStart: number
          priorEventEarliestStartMin: number
        } | null = null

        // 複数店舗選択時は専用ロジックを使用（枠は各店の営業時間から）
        if (selectedStoreIds.length > 1) {
          multiStoreFeasibility = getEarliestAvailableStartForStores(def.key)
          if (multiStoreFeasibility === null) {
            return null // いずれの店舗でも入れない
          }
          earliestPossibleStart = multiStoreFeasibility.earliestStart
          effectiveSlotEndLimit = multiStoreFeasibility.slotEnd
          eveningConfiguredStart = multiStoreFeasibility.slotBaselineStart
        } else {
          // 単一店舗または未選択時の従来ロジック
          const slotStartConsideringEvents = getSlotStartTimeConsideringEvents(def.key)
          
          // -1 は使用不可を意味する
          if (slotStartConsideringEvents === -1) {
            return null
          }
          
          // 前公演のend_time + 1時間を開始時間として計算
          const latestEndBefore = getLatestEndTimeBefore(def.key)
          
          // スロット内イベントの考慮 or 前スロットのイベント考慮
          if (slotStartConsideringEvents !== null && slotStartConsideringEvents > 0) {
            // スロット内にイベントがある場合、その終了+インターバル後
            earliestPossibleStart = Math.max(slotStartConsideringEvents, defaultStartTimes[def.key])
          } else if (latestEndBefore !== null) {
            // 前スロットにイベントがある場合、その終了+1時間後
            const suggestedStart = latestEndBefore + 60
            earliestPossibleStart = Math.max(suggestedStart, defaultStartTimes[def.key])
          } else {
            // イベントがなければデフォルト開始時間
            earliestPossibleStart = defaultStartTimes[def.key]
          }
        }
        
        // === 夜公演の場合は営業時間設定の開始時間を優先 ===
        // 営業時間設定がある場合はその時間を使用
        // ただし、長時間公演で営業終了を超える場合は逆算して早める
        if (def.key === 'evening') {
          // 営業時間設定の開始時間（複数店舗時は当該候補店の枠開始）
          const configuredStart = eveningConfiguredStart
          
          // 営業終了時間から逆算した開始時間（長時間公演用）
          const reverseCalculatedStart = hardDayLimit - durationMinutes
          
          // 前公演がある場合は、その終了+1時間後が最早開始時間
          const hasEarlierEvent = earliestPossibleStart > configuredStart
          
          if (hasEarlierEvent) {
            // 前公演がある場合は前公演終了+1時間後を使用
            startMinutes = earliestPossibleStart
          } else {
            // 前公演がない場合：
            // - 通常公演（設定時間で営業終了内に収まる）→ 設定時間を使用
            // - 長時間公演（設定時間だと営業終了を超える）→ 逆算して早める
            if (configuredStart + durationMinutes <= hardDayLimit) {
              // 設定時間で収まる場合はそのまま使用
              startMinutes = configuredStart
            } else {
              // 長時間公演：逆算して早める
              startMinutes = reverseCalculatedStart
            }
          }
          
          // 営業終了時間を超える場合は無効（前公演がある場合など）
          if (startMinutes + durationMinutes > hardDayLimit) {
            return null // 営業終了時間を超えるので無効
          }
        } else if ((def.key === 'afternoon' || def.key === 'morning') && !isWeekendOrHoliday) {
          // 平日: 夜枠開始 − インターバル = デッド。そこから公演時間＋準備を引いて逆算。
          // 結果 ≥ 午後既定開始(13:00) → 午後枠。< 13:00 → 午前枠（長時間作品用）。
          const eveningStart =
            selectedStoreIds.length > 1 && multiStoreFeasibility
              ? multiStoreFeasibility.slotBaselineStart
              : defaultStartTimes.evening
          const deadline = eveningStart - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
          const reverseStart = deadline - durationMinutes - extraPrepTime
          if (reverseStart < 0) return null
          const afternoonDefault = defaultStartTimes.afternoon
          const isLongFormat = reverseStart < afternoonDefault

          if (def.key === 'afternoon' && isLongFormat) {
            return null // 午前枠で扱うので午後は出さない
          }
          if (def.key === 'morning' && !isLongFormat) {
            return null // 午後枠で収まるので午前は出さない
          }

          let priorFloor = 0
          if (selectedStoreIds.length > 1 && multiStoreFeasibility) {
            priorFloor = multiStoreFeasibility.priorEventEarliestStartMin
          } else {
            const sid =
              selectedStoreIds.length === 1 ? selectedStoreIds[0] : targetStoreId
            if (sid) {
              const row = businessHoursCache.get(sid) as BusinessHoursSettingRow | undefined
              const allowSynthetic = targetStoreIds.length === 1
              const fAf = getPrivateBookingStoreSlotFeasibility(
                targetDate,
                sid,
                def.key,
                row,
                allStoreEvents,
                holidayFn,
                allowSynthetic
              )
              if (fAf) priorFloor = fAf.priorEventEarliestStartMin
            }
          }
          startMinutes = Math.max(reverseStart, priorFloor)
          if (startMinutes + durationMinutes + extraPrepTime > deadline) {
            return null
          }
        } else {
          // 休日の朝・昼は従来通り最早開始準拠
          startMinutes = earliestPossibleStart
        }
        
        const endMinutes = startMinutes + durationMinutes
        
        // 開始時間がスロットの時間帯を超えている場合は無効
        if (startMinutes >= effectiveSlotEndLimit) {
          return null
        }
        
        // 営業終了時間を超える場合は無効
        if (endMinutes > hardDayLimit) {
          return null
        }
        
        // スロット境界内に収まる場合は問題なし
        if (endMinutes <= effectiveSlotEndLimit) {
          return {
            label: def.label,
            startTime: minutesToTime(startMinutes),
            endTime: minutesToTime(endMinutes)
          }
        }
        
        // スロット境界を超える場合：後続イベントがなければ延長可能
        // 次のイベントの1時間前（+ 準備時間）まで、またはイベントがなければ営業終了まで
        const nextEventStart = getEarliestEventStartAfter(startMinutes)
        const bufferNeeded = 60 + extraPrepTime // 1時間インターバル + 準備時間
        const effectiveEndLimit = nextEventStart !== null
          ? nextEventStart - bufferNeeded  // 次イベントのバッファー前まで
          : hardDayLimit - extraPrepTime   // 営業終了から準備時間を引いた時間
        
        if (endMinutes > effectiveEndLimit) {
          return null
        }
        
        return {
          label: def.label,
          startTime: minutesToTime(startMinutes),
          endTime: minutesToTime(endMinutes)
        }
      })
      .filter((slot): slot is TimeSlot => slot !== null)
      .filter((slot) => {
        // シナリオで貸切受付時間枠が指定されている場合、その枠のみ表示
        // （編集画面は「朝公演」等、ここは「午前」ラベル — 別表記を正規化して突き合わせる）
        return isPrivateBookingSlotAllowedByScenarioSettings(
          slot.label,
          scenario?.private_booking_time_slots
        )
      })
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

  return {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    availableStores,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot,
    getTimeSlotsForDate
  }
}

