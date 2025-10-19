import { useState, useEffect, useCallback } from 'react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { getColorFromName } from '@/lib/utils'
import { logger } from '@/utils/logger'
import type { ScenarioDetail, EventSchedule } from '../utils/types'

/**
 * シナリオ詳細とスケジュールデータを管理するフック
 */
export function useScenarioDetail(scenarioId: string) {
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [events, setEvents] = useState<EventSchedule[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadScenarioDetail = useCallback(async () => {
    try {
      // scenarioIdが未定義の場合は何もしない
      if (!scenarioId) {
        return
      }
      
      setIsLoading(true)
      
      // シナリオ詳細を取得
      const scenariosData = await scenarioApi.getAll()
      const scenarioData = scenariosData.find((s: any) => s.id === scenarioId)
      
      if (!scenarioData) {
        logger.error('シナリオが見つかりません')
        return
      }
      
      // 店舗データを取得
      let storesData: any[] = []
      try {
        storesData = await storeApi.getAll()
        setStores(storesData)
      } catch (error) {
        logger.error('店舗データの取得エラー:', error)
        storesData = []
        setStores([])
      }
      
      // 公演スケジュールを取得（3ヶ月先まで）
      const currentDate = new Date()
      const allEvents: any[] = []
      
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth() + 1
        
        const events = await scheduleApi.getByMonth(year, month)
        allEvents.push(...events)
      }
      
      // このシナリオの予約可能な公演のみフィルタリング
      const scenarioEvents = allEvents
        .filter((event: any) => {
          // シナリオの照合
          const isMatchingScenario = 
            event.scenario_id === scenarioData.id ||
            event.scenarios?.id === scenarioData.id ||
            event.scenario === scenarioData.title
          
          // 予約可能条件
          const isEnabled = event.is_reservation_enabled !== false
          const isNotCancelled = !event.is_cancelled
          const isOpen = event.category === 'open'
          
          return isMatchingScenario && isEnabled && isNotCancelled && isOpen
        })
        .map((event: any) => {
          // 店舗IDまたはshort_nameで検索（store_idを優先）
          const store = storesData.find((s: any) => 
            s.id === event.store_id || 
            s.id === event.venue || 
            s.short_name === event.venue
          )
          const available = (event.max_participants || 8) - (event.current_participants || 0)
          
          // 店舗カラーを取得（色名から実際の色コードに変換）
          const storeColor = store?.color ? getColorFromName(store.color) : '#6B7280'
          
          return {
            event_id: event.id,
            date: event.date,
            start_time: event.start_time,
            end_time: event.end_time,
            store_id: event.store_id,
            store_name: store?.name || event.venue,
            store_short_name: store?.short_name || event.venue,
            store_color: storeColor,
            store_address: store?.address,
            max_participants: event.max_participants || 8,
            current_participants: event.current_participants || 0,
            available_seats: available,
            reservation_deadline_hours: event.reservation_deadline_hours || 24,
            is_available: available > 0
          }
        })
        .sort((a: any, b: any) => {
          const dateCompare = a.date.localeCompare(b.date)
          if (dateCompare !== 0) return dateCompare
          return a.start_time.localeCompare(b.start_time)
        })
      
      setScenario({
        scenario_id: scenarioData.id,
        scenario_title: scenarioData.title,
        key_visual_url: scenarioData.key_visual_url,
        synopsis: scenarioData.synopsis || scenarioData.description,
        description: scenarioData.description,
        author: scenarioData.author,
        genre: scenarioData.genre || [],
        duration: scenarioData.duration,
        player_count_min: scenarioData.player_count_min,
        player_count_max: scenarioData.player_count_max,
        difficulty: scenarioData.difficulty,
        rating: scenarioData.rating,
        has_pre_reading: scenarioData.has_pre_reading,
        official_site_url: scenarioData.official_site_url,
        participation_fee: scenarioData.participation_fee || 3000
      })
      
      setEvents(scenarioEvents)
    } catch (error) {
      logger.error('データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }, [scenarioId])

  useEffect(() => {
    loadScenarioDetail()
  }, [loadScenarioDetail])

  return {
    scenario,
    events,
    stores,
    isLoading,
    loadScenarioDetail
  }
}

