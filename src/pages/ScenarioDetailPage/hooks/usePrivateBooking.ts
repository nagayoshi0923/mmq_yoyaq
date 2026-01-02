import { useState, useCallback, useEffect } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getTimeSlot } from '@/utils/scheduleUtils' // 時間帯判定用
import type { TimeSlot, EventSchedule } from '../utils/types'

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
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  // 営業時間設定のキャッシュ（店舗IDをキーにする）
  const [businessHoursCache, setBusinessHoursCache] = useState<Map<string, any>>(new Map())
  const MAX_SELECTIONS = 6

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
        
        // 現在の月から3ヶ月先までの公演を並列取得
        for (let i = 0; i < 3; i++) {
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
        
        setAllStoreEvents(validEvents)
      } catch (error) {
        logger.error('全店舗イベントの取得エラー:', error)
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
          .select('store_id, opening_hours, holidays, time_restrictions')
          .in('store_id', storeIds)
        
        if (error) {
          logger.error('営業時間設定一括取得エラー:', error)
          return
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
  // オフィス（ownership_type='office'）は貸切リクエストの対象外
  const getAvailableStoreIds = useCallback((): Set<string> => {
    // オフィスを除外した店舗リスト
    const validStores = stores.filter(s => s.ownership_type !== 'office')
    
    // シナリオにavailable_storesが設定されている場合のみ、その店舗に限定
    if (scenario) {
      const availableStores = scenario.available_stores || scenario.available_stores_ids
      // 配列が存在し、かつ空でない場合のみ限定
      if (Array.isArray(availableStores) && availableStores.length > 0) {
        // オフィスを除外した上で、シナリオのavailable_storesと一致する店舗のみ
        return new Set(availableStores.filter(id => validStores.some(s => s.id === id)))
      }
    }
    
    // 設定されていない場合、または空配列の場合は全店舗を対象（オフィス除く）
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

  // 営業時間内かどうかをチェックする関数（キャッシュを使用）
  const isWithinBusinessHours = useCallback((date: string, startTime: string, storeId: string): boolean => {
    // キャッシュから営業時間設定を取得
    const data = businessHoursCache.get(storeId)

      if (!data) return true // 設定がない場合は制限しない

      // 休日チェック
      if (data.holidays && data.holidays.includes(date)) {
        return false
      }

      // 営業時間チェック
      if (data.opening_hours) {
        const dayOfWeek = new Date(date).getDay() // 0=日曜日, 1=月曜日, ...
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        const dayName = dayNames[dayOfWeek]
        
        const dayHours = data.opening_hours[dayName]
        if (!dayHours || !dayHours.is_open) {
          return false
        }

        const eventTime = startTime.slice(0, 5) // HH:MM形式
        if (eventTime < dayHours.open_time || eventTime > dayHours.close_time) {
          return false
        }
      }

      return true
  }, [businessHoursCache])

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
      // 営業時間設定をチェック
      if (!isWithinBusinessHours(date, slot.startTime, storeId)) return false
      
      // その店舗・日付・時間帯のイベントをフィルタリング
      const targetTimeSlot = getTimeSlotFromLabel(slot.label)
      const targetDate = date.split('T')[0]
      
      const hasEvent = allStoreEvents.some((e: any) => {
        const eventStoreId = getEventStoreId(e)
        if (!eventStoreId) return false
        
        const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
        const eventTimeSlot = e.start_time ? getTimeSlot(e.start_time) : null
        
        return eventDate === targetDate && eventStoreId === storeId && eventTimeSlot === targetTimeSlot
      })
      
      return !hasEvent // イベントがなければ空いている
    }
    
    // 店舗が選択されている場合：選択された店舗のいずれかで空きがあればtrue
    if (storeIds && storeIds.length > 0) {
      const validStoreIds = storeIds.filter(storeId => 
        availableStoreIds.size === 0 || availableStoreIds.has(storeId)
      )
      if (validStoreIds.length === 0) return false
      return validStoreIds.some(storeId => checkStoreAvailability(storeId))
    }
    
    // 店舗が選択されていない場合：そのシナリオを公演可能な店舗のみを対象
    const availableStoreIdsArray = Array.from(availableStoreIds)
    if (availableStoreIdsArray.length === 0) return stores.length === 0
    
    // いずれかの店舗で空きがあればtrue
    return availableStoreIdsArray.some(storeId => checkStoreAvailability(storeId))
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

  return {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot
  }
}

