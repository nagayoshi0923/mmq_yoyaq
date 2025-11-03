import { useState, useCallback } from 'react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'

export interface ScenarioCard {
  scenario_id: string
  scenario_title: string
  key_visual_url?: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  genre: string[]
  next_event_date?: string
  next_event_time?: string
  store_name?: string
  store_color?: string
  available_seats?: number
  status: 'available' | 'few_seats' | 'sold_out' | 'private_booking'
  is_new?: boolean
}

/**
 * 空席状況を判定（最大人数に対する割合で判定）
 */
function getAvailabilityStatus(max: number, current: number): 'available' | 'few_seats' | 'sold_out' {
  const available = max - current
  if (available === 0) return 'sold_out'
  
  // 最大人数の20%以下を「残りわずか」とする（最低1席は残りわずかの対象）
  const threshold = Math.max(1, Math.floor(max * 0.2))
  if (available <= threshold) return 'few_seats'
  return 'available'
}

/**
 * 公演データの取得と管理を行うフック
 */
export function useBookingData() {
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([])
  const [allEvents, setAllEvents] = useState<any[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * シナリオ・公演・店舗データを読み込む
   */
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      
      // シナリオと公演データを取得
      const scenariosData = await scenarioApi.getAll()
      
      let storesData: any[] = []
      try {
        storesData = await storeApi.getAll()
      } catch (error) {
        logger.error('店舗データの取得エラー:', error)
        storesData = []
      }
      
      // 現在の月から3ヶ月先までの公演を取得
      const currentDate = new Date()
      const allEventsData: any[] = []
      
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth() + 1
        
        const events = await scheduleApi.getByMonth(year, month)
        allEventsData.push(...events)
      }
      
      // 予約可能な公演 + 確定貸切公演をフィルタリング
      const publicEvents = allEventsData.filter((event: any) => {
        const isNotCancelled = !event.is_cancelled
        
        // 通常公演: category='open' かつ is_reservation_enabled=true
        const isOpenAndEnabled = (event.is_reservation_enabled !== false) && (event.category === 'open')
        
        // 貸切公演: category='private' または is_private_booking=true（予約不可として表示）
        const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
        
        return isNotCancelled && (isOpenAndEnabled || isPrivateBooking)
      })
      
      // シナリオごとにグループ化
      const scenarioMap = new Map<string, ScenarioCard>()
      
      scenariosData.forEach((scenario: any) => {
        // ステータスがavailableでないシナリオはスキップ
        if (scenario.status !== 'available') return
        
        // このシナリオの公演を探す（scenario_idまたはタイトルで照合）
        const scenarioEvents = publicEvents.filter((event: any) => {
          // scenario_idで照合（リレーション）
          if (event.scenario_id === scenario.id) return true
          // scenariosオブジェクトのIDで照合
          if (event.scenarios?.id === scenario.id) return true
          // タイトルで照合（フォールバック）
          if (event.scenario === scenario.title) return true
          return false
        })
        
        // 新着判定（リリース日から30日以内）
        const isNew = scenario.release_date ? 
          (new Date().getTime() - new Date(scenario.release_date).getTime()) / (1000 * 60 * 60 * 24) <= 30 : 
          false
        
        // 公演がある場合
        if (scenarioEvents.length > 0) {
          // 今日以降の公演のみをフィルタリング（過去の公演は除外）
          const todayJST = formatDateJST(new Date()) // JSTでの今日の日付文字列（YYYY-MM-DD）
          
          const futureEvents = scenarioEvents.filter((event: any) => {
            // event.dateはYYYY-MM-DD形式の文字列なので、そのまま比較
            return event.date >= todayJST
          })
          
          // 未来の公演がない場合は、過去の公演も含める（全公演から選択）
          const targetEvents = futureEvents.length > 0 ? futureEvents : scenarioEvents
          
          // 最も近い公演を取得
          const nextEvent = targetEvents.sort((a: any, b: any) => {
            const dateCompare = a.date.localeCompare(b.date)
            if (dateCompare !== 0) return dateCompare
            return a.start_time.localeCompare(b.start_time)
          })[0]
          
          const store = storesData.find((s: any) => s.id === nextEvent.venue || s.short_name === nextEvent.venue)
          
          // 貸切公演の場合は満席として扱う
          const isPrivateBooking = nextEvent.is_private_booking === true
          const availableSeats = isPrivateBooking ? 0 : (nextEvent.max_participants || 8) - (nextEvent.current_participants || 0)
          const status = isPrivateBooking ? 'sold_out' : getAvailabilityStatus(nextEvent.max_participants || 8, nextEvent.current_participants || 0)
          
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            next_event_date: nextEvent.date,
            next_event_time: nextEvent.start_time,
            store_name: store?.name || nextEvent.venue,
            store_color: store?.color,
            available_seats: availableSeats,
            status: status,
            is_new: isNew
          })
        } else {
          // 公演がない場合でも、全タイトル用にシナリオ情報を追加
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            status: 'private_booking', // 公演予定なしは「貸切受付中」
            is_new: isNew
          })
        }
      })
      
      const scenarioList = Array.from(scenarioMap.values())
      
      setScenarios(scenarioList)
      setAllEvents(publicEvents) // カレンダー用に全公演データを保存
      setStores(storesData) // 店舗データを保存
      
      // デバッグ: データがない場合の警告
      if (scenarioList.length === 0) {
        console.warn('⚠️ 表示可能なシナリオがありません')
        console.warn('原因の可能性:')
        console.warn('1. シナリオデータが登録されていない')
        console.warn('2. 予約可能な公演（category=open）が登録されていない')
        console.warn('3. is_reservation_enabledがfalseになっている')
        console.warn('4. シナリオと公演の紐付けが正しくない')
      }
    } catch (error) {
      logger.error('データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    scenarios,
    allEvents,
    stores,
    isLoading,
    loadData
  }
}

