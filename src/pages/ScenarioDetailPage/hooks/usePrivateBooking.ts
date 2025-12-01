import { useState, useCallback, useEffect } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getTimeSlot } from '@/utils/scheduleUtils' // 時間帯判定用
import type { TimeSlot, EventSchedule } from '../utils/types'

interface UsePrivateBookingProps {
  events: EventSchedule[]
  stores: any[]
  scenarioId: string
  scenario?: any // シナリオデータ（available_storesを含む）
}

/**
 * 貸切リクエスト関連のロジックを管理するフック
 */
export function usePrivateBooking({ events, stores, scenarioId, scenario }: UsePrivateBookingProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  // 営業時間設定のキャッシュ（店舗IDをキーにする）
  const [businessHoursCache, setBusinessHoursCache] = useState<Map<string, any>>(new Map())
  const MAX_SELECTIONS = 10

  // 現在の月から3ヶ月先までの全店舗のイベントを取得（貸切申込可能日判定用）
  useEffect(() => {
    const loadAllStoreEvents = async () => {
      try {
        const currentDate = new Date()
        const monthPromises = []
        
        // 現在の月から3ヶ月先までの公演を並列取得
        for (let i = 0; i < 3; i++) {
          const targetDate = new Date(currentDate)
          targetDate.setMonth(currentDate.getMonth() + i)
          
          const year = targetDate.getFullYear()
          const month = targetDate.getMonth() + 1
          
          monthPromises.push(scheduleApi.getByMonth(year, month))
        }
        
        const monthResults = await Promise.all(monthPromises)
        const allEvents = monthResults.flat()
        
        // 貸切申込可能日判定用：スケジュール管理画面で表示される全てのイベントを含める
        // スケジュール管理画面で空白のセルには公演がないという判定のため、
        // カテゴリーフィルターに関係なく、全てのカテゴリのイベントを含める
        // （ただし、キャンセルされたイベントは除外）
        const validEvents = allEvents.filter((event: any) => {
          // キャンセルされていない公演のみ
          if (event.is_cancelled) return false
          
          // スケジュール管理画面で表示される全てのカテゴリを含める
          // open, private, gmtest, testplay, offsite, venue_rental, venue_rental_free, package など
          return true
        })
        
        // デバッグログ：11/22のイベントを確認
        const eventsOn1122 = allEvents.filter((event: any) => {
          const eventDate = event.date ? (typeof event.date === 'string' ? event.date.split('T')[0] : event.date) : null
          return eventDate === '2025-11-22'
        })
        const validEventsOn1122 = validEvents.filter((event: any) => {
          const eventDate = event.date ? (typeof event.date === 'string' ? event.date.split('T')[0] : event.date) : null
          return eventDate === '2025-11-22'
        })
        console.log(`[DEBUG] 11/22のイベント:`, {
          allEventsCount: eventsOn1122.length,
          validEventsCount: validEventsOn1122.length,
          allEvents: eventsOn1122.map((e: any) => ({
            date: e.date,
            start_time: e.start_time,
            category: e.category,
            is_reservation_enabled: e.is_reservation_enabled,
            is_cancelled: e.is_cancelled
          })),
          validEvents: validEventsOn1122.map((e: any) => ({
            date: e.date,
            start_time: e.start_time,
            category: e.category,
            is_reservation_enabled: e.is_reservation_enabled,
            is_cancelled: e.is_cancelled
          }))
        })
        
        setAllStoreEvents(validEvents)
      } catch (error) {
        console.error('全店舗イベントの取得エラー:', error)
        setAllStoreEvents([])
      }
    }
    
    loadAllStoreEvents()
  }, [])

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
  
  // 時間枠のラベル（朝/昼/夜）を実際の時間帯（morning/afternoon/evening）にマッピング
  const getTimeSlotFromLabel = useCallback((label: string): 'morning' | 'afternoon' | 'evening' => {
    if (label === '朝') return 'morning'
    if (label === '昼') return 'afternoon'
    if (label === '夜') return 'evening'
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
    
    // デバッグログ（11/22の場合のみ）
    const isDebugTarget = date.includes('2025-11-22')
    if (isDebugTarget) {
      // 11/22の全イベントを確認
      const allEventsOnDate = allStoreEvents.filter((e: any) => {
        const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
        const targetDate = date.split('T')[0]
        return eventDate === targetDate
      })
      
      // 店舗ID→店舗名のマッピングを作成
      const storeIdToName = stores.reduce((acc: Record<string, string>, store) => {
        acc[store.id] = store.name || store.short_name || store.id
        return acc
      }, {})
      
      console.log(`[DEBUG] checkTimeSlotAvailability 開始:`, {
        date,
        slot: slot.label,
        slotStart: slot.startTime,
        slotEnd: slot.endTime,
        storeIds,
        allStoreEventsCount: allStoreEvents.length,
        storesCount: stores.length,
        storeIdToName,
        allEventsOnDate: allEventsOnDate.map((e: any) => ({
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          category: e.category,
          is_reservation_enabled: e.is_reservation_enabled,
          is_cancelled: e.is_cancelled,
          venue: e.venue,
          store_id: getEventStoreId(e),
          store_name: getEventStoreId(e) ? storeIdToName[getEventStoreId(e)] : '不明'
        }))
      })
    }
    
    // 店舗データがまだ読み込まれていない場合は、とりあえずtrueを返す（後で再評価される）
    if (stores.length === 0) {
      if (isDebugTarget) console.log(`[DEBUG] 店舗データ未読み込みのためtrueを返す`)
      return true
    }
    
    // allStoreEventsがまだ読み込まれていない場合は、とりあえずtrueを返す（後で再評価される）
    // ただし、選択された店舗がある場合は、より慎重に判定する
    if (allStoreEvents.length === 0) {
      // 店舗が選択されている場合は、イベントデータがないのでfalseを返す（安全側に倒す）
      if (storeIds && storeIds.length > 0) {
        if (isDebugTarget) console.log(`[DEBUG] イベントデータ未読み込み、店舗選択済みのためfalseを返す`)
        return false
      }
      if (isDebugTarget) console.log(`[DEBUG] イベントデータ未読み込みのためtrueを返す`)
      return true
    }
    
    // 店舗が選択されている場合：選択された店舗のいずれかで空きがあればtrue
    if (storeIds && storeIds.length > 0) {
      // 選択された店舗のうち、そのシナリオを公演可能な店舗のみをフィルタリング
      const validStoreIds = storeIds.filter(storeId => {
        // availableStoreIdsが空の場合は全店舗対象
        if (availableStoreIds.size === 0) return true
        return availableStoreIds.has(storeId)
      })
      
      // 有効な店舗がない場合はfalse
      if (validStoreIds.length === 0) return false
      
      // 各店舗の空き状況をチェック（Promise.allで並列処理）
      const storeAvailabilityPromises = validStoreIds.map(async (storeId) => {
        // まず営業時間設定をチェック（スケジュール管理側と同期）
        const withinBusinessHours = isWithinBusinessHours(date, slot.startTime, storeId)
        if (!withinBusinessHours) {
          if (isDebugTarget) console.log(`[DEBUG] 店舗 ${storeId} の11/22${slot.label}: 営業時間外のため受付不可`, {
            date,
            slot: slot.label,
            startTime: slot.startTime,
            storeId
          })
          return false
        }
        
        // その店舗のイベントをフィルタリング（スケジュール管理画面と同じロジック）
        // スケジュール管理画面で表示されるイベントのみをチェック（空白セルには公演がない）
        const storeEvents = allStoreEvents.filter((e: any) => {
          const eventStoreId = getEventStoreId(e)
          // eventStoreIdがnullの場合は無視（店舗情報が取得できないイベント）
          if (!eventStoreId) return false
          
          // 日付の比較（フォーマットを統一）
          const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
          const targetDate = date.split('T')[0]
          const dateMatch = eventDate === targetDate
          
          // 店舗の一致
          const venueMatch = eventStoreId === storeId
          
          // 時間帯の一致（スケジュール管理画面と同じロジック）
          const targetTimeSlot = getTimeSlotFromLabel(slot.label)
          const eventTimeSlot = e.start_time ? getTimeSlot(e.start_time) : null
          const timeSlotMatch = eventTimeSlot === targetTimeSlot
          
          // スケジュール管理画面で表示される条件：日付・店舗・時間帯が一致
          return dateMatch && venueMatch && timeSlotMatch
        })
        
        // デバッグログ（11/22の場合のみ）
        if (isDebugTarget) {
          const targetTimeSlot = getTimeSlotFromLabel(slot.label)
          console.log(`[DEBUG] 店舗 ${storeId} の11/22${slot.label}のイベント（店舗選択時）:`, {
            targetTimeSlot,
            slotLabel: slot.label,
            storeEvents: storeEvents.map((e: any) => ({
              id: e.id,
              date: e.date,
              start_time: e.start_time,
              end_time: e.end_time,
              category: e.category,
              is_cancelled: e.is_cancelled,
              store_id: getEventStoreId(e),
              eventTimeSlot: e.start_time ? getTimeSlot(e.start_time) : 'unknown',
              matches: e.start_time ? getTimeSlot(e.start_time) === targetTimeSlot : false
            })),
            storeEventsCount: storeEvents.length
          })
        }
        
        // イベントがない場合は空いている
        if (storeEvents.length === 0) return true
        
        // 時間枠の衝突をチェック
        // storeEventsは既にスケジュール管理画面と同じロジックでフィルタリングされているため、
        // この時点でstoreEventsに含まれるイベントは、その時間枠に存在するイベント
        // 同じセルに2個以上のイベントは発生させないため、1件でもあれば衝突
        const hasConflict = storeEvents.length > 0
        
        const isAvailable = !hasConflict
        
        // デバッグログ（11/22の場合のみ）
        if (isDebugTarget) {
          const targetTimeSlot = getTimeSlotFromLabel(slot.label)
          console.log(`[DEBUG] 時間衝突チェック: 店舗 ${storeId} の11/22${slot.label}の時間帯判定`, {
            targetTimeSlot,
            slotLabel: slot.label,
            storeEvents: storeEvents.map((e: any) => ({
              start_time: e.start_time,
              eventTimeSlot: e.start_time ? getTimeSlot(e.start_time) : 'unknown',
              category: e.category,
              matches: e.start_time ? getTimeSlot(e.start_time) === targetTimeSlot : false
            })),
            hasConflict,
            isAvailable
          })
        }
        
        return isAvailable
      })
      
      const storeAvailability = await Promise.all(storeAvailabilityPromises)
      
      // いずれかの店舗で空きがあればtrue
      const result = storeAvailability.some(available => available === true)
      
      // デバッグログ（11/22の場合のみ）
      if (isDebugTarget) {
        console.log(`[DEBUG] 11/22${slot.label}の最終判定:`, {
          date,
          slot: slot.label,
          storeIds: validStoreIds,
          storeAvailability,
          result
        })
      }
      
      return result
    }
    
    // 店舗が選択されていない場合：そのシナリオを公演可能な店舗のみを対象
    const availableStoreIdsArray = Array.from(availableStoreIds)
    
    if (isDebugTarget) {
      console.log(`[DEBUG] 店舗未選択の場合の処理:`, {
        availableStoreIdsArray,
        availableStoreIdsArrayLength: availableStoreIdsArray.length
      })
    }
    
    // availableStoreIdsが空の場合は、storesが空（まだ読み込まれていない）か、何か問題がある
    if (availableStoreIdsArray.length === 0) {
      // storesが空の場合はまだ読み込まれていないので、とりあえずtrueを返す
      if (isDebugTarget) console.log(`[DEBUG] availableStoreIdsが空のため、stores.length === 0 の結果を返す:`, stores.length === 0)
      return stores.length === 0
    }
    
    // 各店舗の空き状況をチェック（Promise.allで並列処理）
    const storeAvailabilityPromises = availableStoreIdsArray.map(async (storeId) => {
      // まず営業時間設定をチェック（スケジュール管理側と同期）
      const withinBusinessHours = isWithinBusinessHours(date, slot.startTime, storeId)
      if (!withinBusinessHours) {
        if (isDebugTarget) console.log(`[DEBUG] 店舗 ${storeId} の11/22${slot.label}: 営業時間外のため受付不可（店舗未選択時）`, {
          date,
          slot: slot.label,
          startTime: slot.startTime,
          storeId
        })
        return false
      }
      
              // その店舗のイベントをフィルタリング（スケジュール管理画面と同じロジック）
              // スケジュール管理画面で表示されるイベントのみをチェック（空白セルには公演がない）
              const storeEvents = allStoreEvents.filter((e: any) => {
                const eventStoreId = getEventStoreId(e)
                // eventStoreIdがnullの場合は無視（店舗情報が取得できないイベント）
                if (!eventStoreId) return false
                
                // 日付の比較（フォーマットを統一）
                const eventDate = e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : e.date) : null
                const targetDate = date.split('T')[0]
                const dateMatch = eventDate === targetDate
                
                // 店舗の一致
                const venueMatch = eventStoreId === storeId
                
                // 時間帯の一致（スケジュール管理画面と同じロジック）
                const targetTimeSlot = getTimeSlotFromLabel(slot.label)
                const eventTimeSlot = e.start_time ? getTimeSlot(e.start_time) : null
                const timeSlotMatch = eventTimeSlot === targetTimeSlot
                
                // スケジュール管理画面で表示される条件：日付・店舗・時間帯が一致
                return dateMatch && venueMatch && timeSlotMatch
              })
      
      if (isDebugTarget) {
        // 店舗ID→店舗名のマッピングを作成
        const storeIdToName = stores.reduce((acc: Record<string, string>, store) => {
          acc[store.id] = store.name || store.short_name || store.id
          return acc
        }, {})
        
        // 別館②の朝のイベントの詳細を特に詳しくログ出力
        if (storeId === '95ac6d74-56df-4cac-a67f-59fff9ab89b9' && slot.label === '朝') {
          console.log(`[DEBUG] ⚠️⚠️⚠️ 別館②の朝のイベント詳細 ⚠️⚠️⚠️`)
          storeEvents.forEach((e: any, index: number) => {
            console.log(`[DEBUG] イベント ${index + 1}:`, {
              id: e.id,
              date: e.date,
              start_time: e.start_time,
              end_time: e.end_time,
              category: e.category,
              is_cancelled: e.is_cancelled,
              is_reservation_enabled: e.is_reservation_enabled,
              venue: e.venue,
              store_id: e.store_id,
              store_id_from_getter: getEventStoreId(e),
              store_name: getEventStoreId(e) ? storeIdToName[getEventStoreId(e)] : '不明',
              scenario: e.scenario || e.scenarios?.title,
              scenario_id: e.scenario_id
            })
            console.log(`[DEBUG] イベント ${index + 1} の完全なデータ:`, e)
          })
        }
        
        const targetTimeSlot = getTimeSlotFromLabel(slot.label)
        if (storeId === '95ac6d74-56df-4cac-a67f-59fff9ab89b9' && slot.label === '夜') { // 別館②の夜の場合のみ
          console.log(`[DEBUG] ⚠️⚠️⚠️ 別館②の夜のイベント詳細 ⚠️⚠️⚠️`)
          storeEvents.forEach((e: any, index: number) => {
            console.log(`[DEBUG] イベント ${index + 1}:`, {
              id: e.id,
              date: e.date,
              start_time: e.start_time,
              end_time: e.end_time,
              category: e.category,
              is_cancelled: e.is_cancelled,
              store_id: getEventStoreId(e),
              eventTimeSlot: e.start_time ? getTimeSlot(e.start_time) : 'unknown',
              targetTimeSlot,
              matches: e.start_time ? getTimeSlot(e.start_time) === targetTimeSlot : false
            })
            console.log(`[DEBUG] イベント ${index + 1} の完全なデータ:`, e)
          })
        }
        console.log(`[DEBUG] 店舗 ${storeId} (${storeIdToName[storeId] || '不明'}) の11/22${slot.label}のイベント（店舗未選択時）:`, {
          targetTimeSlot,
          slotLabel: slot.label,
          storeEvents: storeEvents.map((e: any) => ({
            id: e.id,
            date: e.date,
            start_time: e.start_time,
            end_time: e.end_time,
            category: e.category,
            is_cancelled: e.is_cancelled,
            store_id: getEventStoreId(e),
            eventTimeSlot: e.start_time ? getTimeSlot(e.start_time) : 'unknown',
            matches: e.start_time ? getTimeSlot(e.start_time) === targetTimeSlot : false
          })),
          storeEventsCount: storeEvents.length
        })
      }
      
      // イベントがない場合は空いている
      if (storeEvents.length === 0) {
        if (isDebugTarget) console.log(`[DEBUG] 店舗 ${storeId} の11/22${slot.label}: イベントなしのため空きあり`)
        return true
      }
      
      // 時間枠の衝突をチェック
      // storeEventsは既にスケジュール管理画面と同じロジックでフィルタリングされているため、
      // この時点でstoreEventsに含まれるイベントは、その時間枠に存在するイベント
      // 同じセルに2個以上のイベントは発生させないため、1件でもあれば衝突
      const hasConflict = storeEvents.length > 0
      
      if (isDebugTarget) {
        const targetTimeSlot = getTimeSlotFromLabel(slot.label)
        console.log(`[DEBUG] 時間衝突チェック（店舗未選択時）: 店舗 ${storeId} の11/22${slot.label}の時間帯判定`, {
          targetTimeSlot,
          slotLabel: slot.label,
          storeEvents: storeEvents.map((e: any) => ({
            start_time: e.start_time,
            eventTimeSlot: e.start_time ? getTimeSlot(e.start_time) : 'unknown',
            category: e.category,
            matches: e.start_time ? getTimeSlot(e.start_time) === targetTimeSlot : false
          })),
          hasConflict
        })
      }
      
      const isAvailable = !hasConflict
      if (isDebugTarget) {
        const targetTimeSlot = getTimeSlotFromLabel(slot.label)
        console.log(`[DEBUG] 店舗 ${storeId} の11/22${slot.label}の空き状況（店舗未選択時）:`, {
          isAvailable,
          storeEventsLength: storeEvents.length,
          targetTimeSlot,
          hasConflict
        })
      }
      
      return isAvailable
    })
    
    const storeAvailability = await Promise.all(storeAvailabilityPromises)
    
    // いずれかの店舗で空きがあればtrue
    const result = storeAvailability.some(available => available === true)
    
    if (isDebugTarget) {
      console.log(`[DEBUG] 11/22${slot.label}の最終判定（店舗未選択時）:`, {
        date,
        slot: slot.label,
        availableStoreIdsArray,
        storeAvailability,
        result
      })
    }
    
    return result
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
        alert(`最大${MAX_SELECTIONS}枠まで選択できます`)
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

