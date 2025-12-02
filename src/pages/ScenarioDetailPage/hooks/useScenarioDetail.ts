import { useState, useEffect, useCallback } from 'react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
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
  const [relatedScenarios, setRelatedScenarios] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadScenarioDetail = useCallback(async () => {
    try {
      // scenarioIdが未定義の場合は何もしない
      if (!scenarioId) {
        return
      }
      
      setIsLoading(true)
      
      // シナリオを取得
      const scenarioDataResult = await scenarioApi.getById(scenarioId).catch((error) => {
        logger.error('シナリオデータの取得エラー:', error)
        return null
      })
      
      if (!scenarioDataResult) {
        logger.error('シナリオが見つかりません')
        return
      }
      
      const scenarioData = scenarioDataResult
      
      // 現在の日付から3ヶ月先までの期間を計算
      const currentDate = new Date()
      const monthPromises = []
      
      // 現在の月から3ヶ月先までの公演を並列取得（元の実装に戻す）
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth() + 1
        
        monthPromises.push(scheduleApi.getByMonth(year, month))
      }
      
      // 3ヶ月分のデータを並列取得
      const monthResults = await Promise.all(monthPromises).catch((error) => {
        logger.error('イベントデータの取得エラー:', error)
        return []
      })
      
      const allEvents = monthResults.flat()
      
      // イベントに含まれる店舗IDを収集
      const storeIds = new Set<string>()
      allEvents.forEach((event: any) => {
        if (event.store_id) storeIds.add(event.store_id)
        if (event.venue) storeIds.add(event.venue)
      })
      
      // 店舗データを取得（貸切リクエストタブでも使用するため、全店舗を取得）
      let storesData: any[] = []
      try {
        // 貸切リクエストタブでも使用するため、常に全店舗を取得
        storesData = await storeApi.getAll()
      } catch (error) {
        logger.error('店舗データの取得エラー:', error)
        // エラー時は空配列を設定
        storesData = []
      }
      setStores(storesData)
      
      // このシナリオの公演をフィルタリング（満席も含めて全て表示）
      const scenarioEvents = allEvents
        .filter((event: any) => {
          // シナリオの照合
          const isMatchingScenario = 
            event.scenario_id === scenarioData.id ||
            event.scenarios?.id === scenarioData.id ||
            event.scenario === scenarioData.title
          
          if (!isMatchingScenario) return false
          
          // キャンセルされていないもの
          if (event.is_cancelled) return false
          
          // 通常公演の場合：予約可能なもののみ
          if (event.category === 'open') {
            return event.is_reservation_enabled !== false
          }
          
          // 貸切公演の場合：常に表示
          if (event.category === 'private') {
            return true
          }
          
          return false
        })
        .map((event: any) => {
          // 店舗データを取得（優先順位：event.stores > storesDataから検索）
          let store = event.stores // getByMonthでJOINされている場合
          
          if (!store) {
            // storesDataから検索（store_idを優先、次にvenue）
            store = storesData.find((s: any) => 
              s.id === event.store_id || 
              s.id === event.venue || 
              s.short_name === event.venue ||
              s.name === event.venue
            )
          }
          
          // 最大人数と現在の参加者数を正しく取得（満席も含む）
          // シナリオマスタのplayer_count_maxを使用（公演データは古い値の可能性があるため）
          const maxParticipants = scenarioData.player_count_max || 8
          const currentParticipants = event.current_participants || 0
          const available = maxParticipants - currentParticipants
          
          // 店舗カラーを取得（色名から実際の色コードに変換）
          // event.storesから直接取得するか、storesDataから取得
          const storeColorName = store?.color || (event.stores?.color)
          const storeColor = storeColorName ? getColorFromName(storeColorName) : '#6B7280'
          
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
            max_participants: maxParticipants,
            current_participants: currentParticipants,
            available_seats: available, // 満席の場合は0
            reservation_deadline_hours: event.reservation_deadline_hours || 24,
            is_available: available > 0 // 満席の場合はfalse
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
      
      // 同じ著者の他作品を取得
      if (scenarioData.author) {
        try {
          const { data: relatedData } = await supabase
            .from('scenarios')
            .select('id, title, key_visual_url, author, player_count_min, player_count_max, duration')
            .eq('author', scenarioData.author)
            .neq('id', scenarioData.id)
            .limit(6)
          
          setRelatedScenarios(relatedData || [])
        } catch (error) {
          logger.error('関連シナリオの取得エラー:', error)
          setRelatedScenarios([])
        }
      }
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
    relatedScenarios,
    isLoading,
    loadScenarioDetail
  }
}

