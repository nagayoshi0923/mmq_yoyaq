import { useState, useCallback, useEffect, useMemo } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getTimeSlot } from '@/utils/scheduleUtils' // 時間帯判定用
import { usePrivateBookingStorePreference, useStoreFilterPreference } from '@/hooks/useUserPreference'
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
}

/**
 * 貸切リクエスト関連のロジックを管理するフック
 */
export function usePrivateBooking({ events, stores, scenarioId, scenario, organizationSlug }: UsePrivateBookingProps) {
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
      
      // 貸切用に保存された店舗がある場合はそれを使用
      if (savedStoreIds.length > 0) {
        const validStoreIds = savedStoreIds.filter(id => {
          // 店舗が存在するかチェック
          const storeExists = stores.some(s => s.id === id && s.ownership_type !== 'office')
          // シナリオ対応店舗かチェック
          const isScenarioStore = !hasScenarioStoreLimit || scenarioAvailableStores.includes(id)
          return storeExists && isScenarioStore
        })
        setSelectedStoreIdsInternal(validStoreIds)
      } else if (storeFilterIds && storeFilterIds.length > 0) {
        // 初回のみ：貸切用が空で、カレンダー/リストで店舗が選択されている場合
        const validFilterIds = storeFilterIds.filter(id => {
          const store = stores.find(s => s.id === id && s.ownership_type !== 'office')
          const isScenarioStore = !hasScenarioStoreLimit || scenarioAvailableStores.includes(id)
          return store && isScenarioStore
        })
        if (validFilterIds.length > 0) {
          setSelectedStoreIdsInternal(validFilterIds)
          setSavedStoreIds(validFilterIds)
        }
      }
    }
  }, [stores, savedStoreIds, storeFilterIds, hasInitialized, setSavedStoreIds, scenario])

  // 現在の月から3ヶ月先までの全店舗のイベントを取得（貸切申込可能日判定用）
  useEffect(() => {
    const loadAllStoreEvents = async () => {
      try {
        // organizationSlugからorganization_idを取得
        let orgId: string | undefined = undefined
        if (organizationSlug) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', organizationSlug)
            .eq('is_active', true)
            .single()
          
          if (orgData) {
            orgId = orgData.id
          }
        }
        
        const currentDate = new Date()
        const monthPromises = []
        
        // 現在の月から6ヶ月先までの公演を並列取得
        for (let i = 0; i < 6; i++) {
          const targetDate = new Date(currentDate)
          targetDate.setMonth(currentDate.getMonth() + i)
          
          const year = targetDate.getFullYear()
          const month = targetDate.getMonth() + 1
          
          // organization_idでフィルタリング
          monthPromises.push(scheduleApi.getByMonth(year, month, orgId))
        }
        
        const monthResults = await Promise.all(monthPromises)
        const allEvents = monthResults.flat()
        
        // 貸切申込可能日判定用：スケジュール管理画面で表示される全てのイベントを含める
        // カテゴリーフィルターに関係なく、全てのカテゴリのイベントを含める
        // （ただし、キャンセルされたイベントは除外）
        const validEvents = allEvents.filter((event: any) => {
          if (event.is_cancelled) return false
          return true
        })
        
        logger.log('📅 allStoreEvents loaded:', validEvents.length, '件')
        setAllStoreEvents(validEvents)
      } catch (error) {
        logger.error('全店舗イベントの取得エラー:', error)
        console.error('📅 allStoreEvents取得エラー:', error)
        setAllStoreEvents([])
      }
    }
    
    loadAllStoreEvents()
  }, [organizationSlug])

  // 営業時間設定を一括で取得してキャッシュ
  useEffect(() => {
    const loadBusinessHours = async () => {
      if (stores.length === 0) return
      
      try {
        // 全店舗の営業時間設定を一括取得
        const storeIds = stores.map(s => s.id)
        const { data, error } = await supabase
          .from('business_hours_settings')
          .select('store_id, opening_hours, holidays')
          .in('store_id', storeIds)
        
        if (error) {
          logger.error('営業時間設定一括取得エラー:', error)
          // エラーでも続行（デフォルト設定を適用）
        }
        
        // キャッシュに保存
        const cache = new Map<string, any>()
        if (data) {
          logger.log('[営業時間設定] 取得データ:', data.length, '件')
          for (const setting of data) {
            logger.log('[営業時間設定] 店舗:', setting.store_id, 'opening_hours:', setting.opening_hours ? '設定あり' : 'なし')
            cache.set(setting.store_id, setting)
          }
        } else {
          logger.log('[営業時間設定] データなし')
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
        return new Set(availableStores.filter(id => validStores.some(s => s.id === id)))
      }
    }
    
    // 設定されていない場合、または空配列の場合は全店舗を対象（オフィス除く、営業中のみ）
    return new Set(validStores.map(s => s.id))
  }, [scenario, stores])
  
  // 時間枠のラベル（朝/昼/夜 または 朝公演/昼公演/夜公演）を実際の時間帯（morning/afternoon/evening）にマッピング
  const getTimeSlotFromLabel = useCallback((label: string): 'morning' | 'afternoon' | 'evening' => {
    if (label === '朝' || label === '朝公演') return 'morning'
    if (label === '昼' || label === '昼公演') return 'afternoon'
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
  // 平日（月〜金）：昼・夜のみ、土日：全公演
  const getDefaultAvailableSlots = useCallback((dayOfWeek: number): ('morning' | 'afternoon' | 'evening')[] => {
    // 0=日曜日, 6=土曜日
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return ['morning', 'afternoon', 'evening'] // 土日は全公演
    }
    return ['afternoon', 'evening'] // 平日は昼・夜のみ
  }, [])

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
        const defaultSlots = getDefaultAvailableSlots(dayOfWeek)
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
    
    // 曜日ごとの営業時間・公演枠チェック
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[dayOfWeek]
    
    if (data.opening_hours) {
      const dayHours = data.opening_hours[dayName]
      if (!dayHours || !dayHours.is_open) {
        return false // その曜日は休業
      }
      
      // 公演枠チェック（available_slotsが設定されている場合）
      if (timeSlot && dayHours.available_slots && Array.isArray(dayHours.available_slots)) {
        if (!dayHours.available_slots.includes(timeSlot)) {
          return false // この公演枠は受付不可
        }
      } else if (timeSlot) {
        // available_slotsが設定されていない場合はデフォルトを適用
        const defaultSlots = getDefaultAvailableSlots(dayOfWeek)
        if (!defaultSlots.includes(timeSlot)) {
          return false
        }
      }
    } else if (timeSlot) {
      // opening_hoursがない場合もデフォルトを適用
      const defaultSlots = getDefaultAvailableSlots(dayOfWeek)
      if (!defaultSlots.includes(timeSlot)) {
        return false
      }
    }
    
    return true
  }, [businessHoursCache, getDefaultAvailableSlots])

  // 特定の日付と時間枠が空いているかチェック（店舗フィルター対応）
  // 全店舗のイベントを使用して判定（特定シナリオのイベントのみではない）
  // そのシナリオを公演可能な店舗のみを対象とする
  // スケジュール管理側の営業時間設定も考慮する（同期）
  const checkTimeSlotAvailability = useCallback(async (date: string, slot: TimeSlot, storeIds?: string[]): Promise<boolean> => {
    const availableStoreIds = getAvailableStoreIds()
    
    // 店舗データがまだ読み込まれていない場合は、とりあえずtrueを返す（後で再評価される）
    if (stores.length === 0) return true
    
    // allStoreEventsがまだ読み込まれていない場合
    if (allStoreEvents.length === 0) {
      // 店舗が選択されている場合は、falseを返す（安全側に倒す）
      if (storeIds && storeIds.length > 0) return false
      return true
    }
    
    // 特定店舗のイベントをチェックする共通関数
    const checkStoreAvailability = (storeId: string): boolean => {
      // その店舗・日付・時間帯のイベントをフィルタリング
      const targetTimeSlot = getTimeSlotFromLabel(slot.label)
      const targetDate = date.split('T')[0]
      
      // 営業時間・公演枠設定をチェック
      const withinBusinessHours = isWithinBusinessHours(date, slot.startTime, storeId, targetTimeSlot)
      if (!withinBusinessHours) {
        // 4/4の昼公演のみログ出力（本番でも表示）
        if (targetDate === '2026-04-04' && slot.label === '昼公演') {
          console.log('[checkStoreAvailability] 営業時間外:', { storeId, date, slot, targetTimeSlot })
        }
        return false
      }
      
      // 申込みたい公演の時間範囲（分）
      // 追加準備時間を終了時間に加算
      const parseTime = (time: string): number => {
        const [h, m] = time.split(':').map(Number)
        return h * 60 + (m || 0)
      }
      const extraPrepTime = scenario?.extra_preparation_time || 0
      const scenarioDuration = scenario?.duration || 180 // シナリオ公演時間（デフォルト3時間）
      const requestStart = parseTime(slot.startTime)
      const requestEnd = parseTime(slot.endTime) + extraPrepTime
      
      // スロットの終了時間上限（昼公演は18:00、夜公演は23:00）
      const slotEndLimits: Record<string, number> = {
        morning: 13 * 60,   // 13:00
        afternoon: 18 * 60, // 18:00
        evening: 23 * 60    // 23:00
      }
      const slotEndLimit = slotEndLimits[targetTimeSlot] || 18 * 60
      
      // その店舗・日付のイベントを取得
      const storeEvents = allStoreEvents.filter((e: any) => {
        const eventStoreId = e.store_id || e.stores?.id
        if (!eventStoreId || eventStoreId !== storeId) return false
        const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
        return eventDate === targetDate
      })
      
      // コンフリクトチェック: 開始時間をずらしても入れるかを確認
      const conflictingEvents: any[] = []
      let canFit = true
      let adjustedStart = requestStart
      
      // このスロットの時間帯と重なるイベントの最遅終了時間を計算
      let latestEventEnd = 0
      storeEvents.forEach((e: any) => {
        const eventStartTime = e.start_time || ''
        const eventEndTime = e.end_time || ''
        if (!eventStartTime) return
        
        const eventStart = parseTime(eventStartTime)
        const eventEnd = eventEndTime ? parseTime(eventEndTime) : eventStart + 240
        const eventEndWithBuffer = eventEnd + 60 // 1時間インターバル
        
        // このイベントがスロットの時間帯と重なるか
        if (eventStart < slotEndLimit && eventEndWithBuffer > requestStart) {
          if (eventEndWithBuffer > latestEventEnd) {
            latestEventEnd = eventEndWithBuffer
          }
          conflictingEvents.push({
            title: e.title,
            start: eventStartTime,
            end: eventEndTime,
            eventEnd,
            eventEndWithBuffer
          })
        }
      })
      
      // イベントがある場合、その終了+1時間後に開始すれば収まるか
      if (latestEventEnd > 0) {
        adjustedStart = Math.max(requestStart, latestEventEnd)
        const adjustedEnd = adjustedStart + scenarioDuration + extraPrepTime
        
        // 調整後の公演がスロット終了時間内に収まるか
        canFit = adjustedEnd <= slotEndLimit
      }
      
      // ずらしても収まらない場合、後続イベント（夜公演など）との兼ね合いも確認
      if (canFit && latestEventEnd > 0) {
        // 調整後の開始時間以降にイベントがあるか確認
        const adjustedEnd = adjustedStart + scenarioDuration + extraPrepTime
        const hasLaterConflict = storeEvents.some((e: any) => {
          const eventStartTime = e.start_time || ''
          if (!eventStartTime) return false
          const eventStart = parseTime(eventStartTime)
          const eventExtraPrepTime = e.scenarios?.extra_preparation_time || 0
          const eventPrepTime = 60 + eventExtraPrepTime
          const eventActualStart = eventStart - eventPrepTime
          
          // 調整後の公演が、後続イベントの準備時間と被る場合
          return eventStart > adjustedStart && adjustedEnd > eventActualStart
        })
        
        if (hasLaterConflict) {
          canFit = false
        }
      }
      
      // 4/4の昼公演のみログ出力（本番でも表示）
      if (targetDate === '2026-04-04' && slot.label === '昼公演') {
        console.log('[checkStoreAvailability] コンフリクトチェック:', {
          storeId,
          requestStart,
          requestStartTime: `${Math.floor(requestStart/60)}:${String(requestStart%60).padStart(2,'0')}`,
          latestEventEnd,
          adjustedStart,
          adjustedStartTime: `${Math.floor(adjustedStart/60)}:${String(adjustedStart%60).padStart(2,'0')}`,
          slotEndLimit,
          canFit,
          conflictingEvents
        })
      }
      
      return canFit // 開始時間をずらしても収まれば空いている
    }
    
    // 店舗が選択されている場合：選択された店舗のいずれかで空きがあればtrue
    if (storeIds && storeIds.length > 0) {
      const validStoreIds = storeIds.filter(storeId => 
        availableStoreIds.size === 0 || availableStoreIds.has(storeId)
      )
      if (validStoreIds.length === 0) return false
      
      // デバッグログ
      const targetDate = date.split('T')[0]
      const targetTimeSlot = getTimeSlotFromLabel(slot.label)
      
      const results = validStoreIds.map(storeId => {
        const isAvailable = checkStoreAvailability(storeId)
        return { storeId, isAvailable }
      })
      
      const anyAvailable = results.some(r => r.isAvailable)
      
      // 4/4の昼公演のみログ出力（本番でも表示）
      if (targetDate === '2026-04-04' && slot.label === '昼公演') {
        console.log('[checkTimeSlotAvailability] 4/4昼公演チェック:', {
          slot,
          validStoreIds,
          results,
          anyAvailable
        })
      }
      
      return anyAvailable
    }
    
    // 店舗が選択されていない場合：営業時間設定があればそれを使用、なければデフォルト
    const targetTimeSlot = getTimeSlotFromLabel(slot.label)
    const dayOfWeek = new Date(date).getDay()
    
    // キャッシュに設定があれば最初の設定を使用（全店舗共通設定として）
    let allowedSlots: ('morning' | 'afternoon' | 'evening')[] = getDefaultAvailableSlots(dayOfWeek)
    
    if (businessHoursCache.size > 0) {
      const firstStoreId = businessHoursCache.keys().next().value as string | undefined
      const settings = firstStoreId ? businessHoursCache.get(firstStoreId) : undefined
      if (settings?.opening_hours) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        const dayName = dayNames[dayOfWeek]
        const dayHours = settings.opening_hours[dayName]
        if (dayHours?.available_slots && dayHours.available_slots.length > 0) {
          allowedSlots = dayHours.available_slots
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStoreEvents, getAvailableStoreIds, getEventStoreId, getTimeSlotFromLabel, stores, isWithinBusinessHours])

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
        // ローカルタイムゾーンで日付文字列を生成（UTCではなく）
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
    const dayOfWeek = new Date(date).getDay() // 0=日曜日, 1=月曜日, ...
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    
    // シナリオの公演時間（分）- デフォルト180分（3時間）
    const durationMinutes = scenario?.duration || 180
    
    // 選択された店舗がある場合は、その店舗の設定を使用
    // 店舗未選択時はキャッシュの最初の店舗の設定を使用（全店舗共通設定として）
    let targetStoreId = selectedStoreIds.length > 0 ? selectedStoreIds[0] : null
    
    // 店舗未選択時、キャッシュに設定があれば最初の設定を使用
    if (!targetStoreId && businessHoursCache.size > 0) {
      targetStoreId = (businessHoursCache.keys().next().value as string | undefined) ?? null
    }
    
    const settings = targetStoreId ? businessHoursCache.get(targetStoreId) : null
    
    // デバッグログ
    logger.log('[getTimeSlotsForDate]', {
      date,
      dayOfWeek,
      isWeekend,
      targetStoreId,
      hasSettings: !!settings,
      hasOpeningHours: !!settings?.opening_hours,
      cacheSize: businessHoursCache.size
    })
    
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
    
    // デフォルトの開始時間・終了時間（曜日で分ける: 平日は昼13:00開始、土日は14:00）
    const defaultStartTimes: Record<string, number> = isWeekend
      ? {
          morning: timeToMinutes('10:00'),
          afternoon: timeToMinutes('14:00'),
          evening: timeToMinutes('18:00')
        }
      : {
          morning: timeToMinutes('10:00'),
          afternoon: timeToMinutes('13:00'),  // 平日は13:00開始
          evening: timeToMinutes('18:00')
        }
    const slotEndLimits: Record<string, number> = {
      morning: timeToMinutes('13:00'),
      afternoon: timeToMinutes('18:00'),
      evening: timeToMinutes('23:00')
    }
    
    // 営業時間設定がある場合、曜日ごとの設定を取得
    let availableSlots: ('morning' | 'afternoon' | 'evening')[] = isWeekend 
      ? ['morning', 'afternoon', 'evening'] 
      : ['afternoon', 'evening']
    
    if (settings?.opening_hours) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const dayName = dayNames[dayOfWeek]
      const dayHours = settings.opening_hours[dayName]
      
      logger.log('[getTimeSlotsForDate] 営業時間設定', {
        dayName,
        dayHours,
        slot_start_times: dayHours?.slot_start_times,
        open_time: dayHours?.open_time
      })
      
      if (dayHours) {
        // 店舗設定からは利用可能な公演枠のみを取得
        if (dayHours.available_slots && dayHours.available_slots.length > 0) {
          availableSlots = dayHours.available_slots
        }
        
        // 営業時間設定の公演枠開始時間を適用（slot_start_times）
        if (dayHours.slot_start_times) {
          const st = dayHours.slot_start_times
          logger.log('[getTimeSlotsForDate] slot_start_times適用:', st)
          if (st.morning) defaultStartTimes.morning = timeToMinutes(st.morning)
          if (st.afternoon) defaultStartTimes.afternoon = timeToMinutes(st.afternoon)
          if (st.evening) defaultStartTimes.evening = timeToMinutes(st.evening)
        }
        // slot_start_timesがない場合はopen_timeを昼公演の開始時間として使用
        else if (dayHours.open_time) {
          const openMinutes = timeToMinutes(dayHours.open_time)
          logger.log('[getTimeSlotsForDate] open_timeからafternoon開始時間を設定:', dayHours.open_time, '→', openMinutes)
          // 営業開始時間が昼公演のデフォルト開始時間と異なる場合、それを適用
          if (openMinutes > timeToMinutes('09:00') && openMinutes < timeToMinutes('16:00')) {
            defaultStartTimes.afternoon = openMinutes
          }
        }
        
        // 営業終了時間を夜公演の上限に反映
        if (dayHours.close_time) {
          slotEndLimits.evening = timeToMinutes(dayHours.close_time)
        }
      }
    }
    
    logger.log('[getTimeSlotsForDate] 最終開始時間:', {
      morning: minutesToTime(defaultStartTimes.morning),
      afternoon: minutesToTime(defaultStartTimes.afternoon),
      evening: minutesToTime(defaultStartTimes.evening)
    })
    
    // === 既存イベントのスケジュールを参照して開始時間を計算 ===
    const targetDate = date.split('T')[0]
    
    // 対象店舗のイベントを取得（選択店舗 or 全店舗）
    const targetStoreIds = selectedStoreIds.length > 0 
      ? selectedStoreIds 
      : stores.map(s => s.id)
    
    // 当日の全イベント（キャンセル除く）を時間順に取得
    // 複数店舗選択時は、いずれかの店舗で空いていれば公演可能なので、
    // ここでは最も制約が少ない状態（イベントなし）として扱う
    // 実際の可用性判定はcheckTimeSlotAvailabilityで行う
    const dayEvents = selectedStoreIds.length > 1
      ? [] // 複数店舗選択時はイベントを考慮しない（checkTimeSlotAvailabilityで判定）
      : allStoreEvents
        .filter((e: any) => {
          const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
          if (eventDate !== targetDate) return false
          const eventStoreId = e.store_id || e.stores?.id
          // 単一店舗選択時のみ、その店舗のイベントをフィルタ
          if (selectedStoreIds.length === 1) {
            return eventStoreId === selectedStoreIds[0]
          }
          return true
        })
        .sort((a: any, b: any) => (a.end_time || '').localeCompare(b.end_time || ''))
    
    
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
    const getSlotStartTimeConsideringEvents = (slotKey: string): number | null => {
      const slotStart = defaultStartTimes[slotKey]
      const slotEnd = slotEndLimits[slotKey]
      const extraPrepTime = scenario?.extra_preparation_time || 0
      
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
      
      // スロット内のイベントの中で最も遅い終了時間を取得
      let latestEnd = 0
      eventsInSlot.forEach((e: any) => {
        const eventEnd = e.end_time ? timeToMinutes(e.end_time) : timeToMinutes(e.start_time) + 240
        const eventExtraPrepTime = e.scenarios?.extra_preparation_time || 0
        const effectiveEnd = eventEnd + 60 + eventExtraPrepTime // 1時間インターバル + 準備時間
        if (effectiveEnd > latestEnd) latestEnd = effectiveEnd
      })
      
      // 開始可能時間がスロット終了を超えていたら、このスロットは使えない
      if (latestEnd >= slotEnd) {
        return -1 // 使用不可
      }
      
      return Math.max(latestEnd, slotStart)
    }
    
    // 時間枠を生成（有効な公演枠のみ）
    const slotDefinitions: { key: 'morning' | 'afternoon' | 'evening'; label: string }[] = [
      { key: 'morning', label: '朝公演' },
      { key: 'afternoon', label: '昼公演' },
      { key: 'evening', label: '夜公演' }
    ]
    const hardDayLimit = timeToMinutes('23:00')
    
    return slotDefinitions
      .filter(def => availableSlots.includes(def.key))
      .map(def => {
        // スロット内のイベントを考慮した開始時間を計算
        const slotStartConsideringEvents = getSlotStartTimeConsideringEvents(def.key)
        
        // -1 は使用不可を意味する
        if (slotStartConsideringEvents === -1) {
          return null
        }
        
        // 前公演のend_time + 1時間を開始時間として計算
        const latestEndBefore = getLatestEndTimeBefore(def.key)
        let startMinutes: number
        
        // スロット内イベントの考慮 or 前スロットのイベント考慮
        if (slotStartConsideringEvents !== null && slotStartConsideringEvents > 0) {
          // スロット内にイベントがある場合、その終了+インターバル後
          startMinutes = Math.max(slotStartConsideringEvents, defaultStartTimes[def.key])
        } else if (latestEndBefore !== null) {
          // 前スロットにイベントがある場合、その終了+1時間後
          const suggestedStart = latestEndBefore + 60
          startMinutes = Math.max(suggestedStart, defaultStartTimes[def.key])
        } else {
          // イベントがなければデフォルト開始時間
          startMinutes = defaultStartTimes[def.key]
        }
        
        const endMinutes = startMinutes + durationMinutes
        const slotEndLimit = slotEndLimits[def.key]
        const extraPrepTime = scenario?.extra_preparation_time || 0
        
        // 開始時間がスロットの時間帯を超えている場合は無効
        if (startMinutes >= slotEndLimit) {
          return null
        }
        
        // 営業終了時間を超える場合は無効
        if (endMinutes > hardDayLimit) {
          return null
        }
        
        // スロット境界内に収まる場合は問題なし
        if (endMinutes <= slotEndLimit) {
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
  }, [selectedStoreIds, businessHoursCache, scenario, allStoreEvents, stores])

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

