import { useState, useCallback, useMemo } from 'react'
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
  participation_fee?: number
  next_events?: Array<{
    date: string
    time?: string
    store_name?: string
    available_seats?: number
  }>
  total_events_count?: number // 次回公演の総数（表示用）
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
 *
 * パフォーマンス最適化:
 * - React Queryの導入検討（キャッシュ有効活用）
 * - メモリ使用量の最適化（不要なデータは破棄）
 * - 初期表示データの制限（最初の1ヶ月のみ取得）
 */
export function useBookingData() {
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([])
  const [allEvents, setAllEvents] = useState<any[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * シナリオ・公演・店舗データを読み込む
   *
   * パフォーマンス最適化:
   * - 3ヶ月分のデータを並列取得（Promise.all）
   * - scenarioApi.getPublic() で必要なフィールドのみ取得
   * - Mapを使用したO(1)アクセス
   * - イベントの事前インデックス化
   */
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const startTime = performance.now()
      
      // 初期表示パフォーマンス最適化: 最初の1ヶ月のみ取得
      // （ユーザーが操作で追加の月を読み込むようにする）
      const currentDate = new Date()
      const monthPromises = []

      // 現在の月のみ取得（1ヶ月分）- パフォーマンス最適化
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      
      const apiStartTime = performance.now()
      monthPromises.push(scheduleApi.getByMonth(year, month))
      logger.log(`⏱️ API呼び出し開始: ${((performance.now() - apiStartTime).toFixed(2))}ms`)

      // すべてのデータを並列取得（最適化: getPublic()を使用）
      const fetchStartTime = performance.now()
      const [scenariosData, storesDataResult, ...monthResults] = await Promise.all([
        scenarioApi.getPublic(), // status='available'のみ、必要なフィールドのみ取得
        storeApi.getAll().catch((error) => {
          logger.error('店舗データの取得エラー:', error)
          return []
        }),
        ...monthPromises
      ])
      const fetchEndTime = performance.now()
      logger.log(`⏱️ データ取得完了: ${((fetchEndTime - fetchStartTime) / 1000).toFixed(2)}秒`)
      
      const storesData = storesDataResult || []
      const allEventsData = monthResults.flat()
      logger.log(`📊 取得データ: シナリオ${scenariosData.length}件, 店舗${storesData.length}件, 公演${allEventsData.length}件`)
      
      // 今日の日付を一度だけ計算（フィルタリング前に計算）
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayJST = formatDateJST(today)
      const todayTimestamp = today.getTime()
      
      // 予約可能な公演 + 確定貸切公演をフィルタリング
      // 最適化: 過去の公演は除外してメモリ使用量を削減
      const publicEvents = allEventsData.filter((event: any) => {
        const isNotCancelled = !event.is_cancelled
        
        // 過去の公演は除外（メモリ最適化）
        const isFuture = event.date >= todayJST
        if (!isFuture) return false
        
        // 通常公演: category='open' かつ is_reservation_enabled=true
        const isOpenAndEnabled = (event.is_reservation_enabled !== false) && (event.category === 'open')
        
        // 貸切公演: category='private' または is_private_booking=true（予約不可として表示）
        const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
        
        return isNotCancelled && (isOpenAndEnabled || isPrivateBooking)
      })
      
      // 最適化: 店舗データをMapに変換（O(1)アクセス）
      const storeMap = new Map<string, any>()
      storesData.forEach((store: any) => {
        storeMap.set(store.id, store)
        if (store.short_name) storeMap.set(store.short_name, store)
        if (store.name) storeMap.set(store.name, store)
      })
      
      // 最適化: イベントをシナリオIDでインデックス化（O(1)アクセス）
      // 重複を避けるため、SetでイベントIDを管理
      const eventsByScenarioId = new Map<string, Map<string, any>>()
      
      publicEvents.forEach((event: any) => {
        // scenario_idでインデックス化（優先）
        const scenarioId = event.scenario_id || event.scenarios?.id
        if (scenarioId) {
          if (!eventsByScenarioId.has(scenarioId)) {
            eventsByScenarioId.set(scenarioId, new Map())
          }
          eventsByScenarioId.get(scenarioId)!.set(event.id, event)
        }
      })
      
      // シナリオごとにグループ化
      const scenarioMap = new Map<string, ScenarioCard>()
      
      // シナリオカード作成のヘルパー関数（重複コード削減）
      const createScenarioCard = (
        scenario: any,
        nextEvents: any[],
        targetEvents: any[],
        status: 'available' | 'few_seats' | 'sold_out' | 'private_booking',
        isNew: boolean
      ): ScenarioCard => ({
        scenario_id: scenario.id,
        scenario_title: scenario.title,
        key_visual_url: scenario.key_visual_url,
        author: scenario.author,
        duration: scenario.duration,
        player_count_min: scenario.player_count_min,
        player_count_max: scenario.player_count_max,
        genre: scenario.genre || [],
        participation_fee: scenario.participation_fee || 3000,
        next_events: nextEvents,
        total_events_count: targetEvents.length,
        status: status,
        is_new: isNew
      })
      
      scenariosData.forEach((scenario: any) => {
        // getPublic()で既にstatus='available'のみ取得されているため、チェック不要
        
        // 最適化: Mapから直接取得（O(1)）、重複なし
        const scenarioEventsMap = eventsByScenarioId.get(scenario.id)
        const uniqueEvents = scenarioEventsMap ? Array.from(scenarioEventsMap.values()) : []
        
        // 新着判定（リリース日から30日以内）- 事前計算で最適化
        const isNew = scenario.release_date ? 
          (todayTimestamp - new Date(scenario.release_date).getTime()) / (1000 * 60 * 60 * 24) <= 30 : 
          false
        
        // 公演がある場合
        if (uniqueEvents.length > 0) {
          // 今日以降の公演のみをフィルタリング（満席も含む、過去の公演は除外、貸切・GMテストは除外）
          const futureEvents = uniqueEvents.filter((event: any) => {
            // event.dateはYYYY-MM-DD形式の文字列なので、そのまま比較
            // 今日を含む（>=）で判定
            const isFuture = event.date >= todayJST
            // 貸切予約とGMテストは除外
            const isNotPrivate = !(event.is_private_booking === true || event.category === 'private')
            const isNotGmTest = event.category !== 'gmtest'
            return isFuture && isNotPrivate && isNotGmTest
          })
          
          // 未来の公演がない場合は空配列にする（過去の公演は表示しない）
          const targetEvents = futureEvents
          
          // 最も近い公演を最大3つまで取得（日付・時刻順にソート）
          // 満席の公演も含めてソート
          const sortedEvents = [...targetEvents].sort((a: any, b: any) => {
            // 日付で比較
            const dateCompare = a.date.localeCompare(b.date)
            if (dateCompare !== 0) return dateCompare
            // 同じ日付の場合、時刻で比較
            return (a.start_time || '').localeCompare(b.start_time || '')
          })
          
          // 最大3つまで選択（満席も含む）
          const nextEvents = sortedEvents.slice(0, 3).map((event: any) => {
            // 最適化: Mapから直接取得（O(1)）、find()は使用しない
            const store = storeMap.get(event.venue) || storeMap.get(event.store_id)
            
            // scenarios.player_count_maxを最優先（capacityは古い値の可能性があるため）
            const scenarioMaxPlayers = event.scenarios?.player_count_max
            const maxParticipants = scenarioMaxPlayers ||
                                    event.max_participants ||
                                    event.capacity ||
                                    8
            const currentParticipants = event.current_participants || 0
            const availableSeats = event.is_private_booking === true 
              ? 0 
              : maxParticipants - currentParticipants
            
            return {
              date: event.date,
              time: event.start_time,
              store_name: store?.name || event.venue,
              available_seats: availableSeats
            }
          })
          
          // ステータスは最も近い公演で判定（未来の公演がある場合のみ）
          let status: 'available' | 'few_seats' | 'sold_out' | 'private_booking' = 'private_booking'
          if (sortedEvents.length > 0) {
            const nextEvent = sortedEvents[0]
            const isPrivateBooking = nextEvent.is_private_booking === true
            // scenarios.player_count_maxを最優先（capacityは古い値の可能性があるため）
            const nextEventScenarioMaxPlayers = nextEvent.scenarios?.player_count_max
            const maxParticipants = nextEventScenarioMaxPlayers ||
                                    nextEvent.max_participants ||
                                    nextEvent.capacity ||
                                    8
            const currentParticipants = nextEvent.current_participants || 0
            status = isPrivateBooking ? 'sold_out' : getAvailabilityStatus(maxParticipants, currentParticipants)
          }
          
          // 未来の公演がある場合のみシナリオを追加
          // 満席の公演も含めて全ての公演をカウント
          if (nextEvents.length > 0 || targetEvents.length > 0) {
            scenarioMap.set(scenario.id, createScenarioCard(scenario, nextEvents, targetEvents, status, isNew))
          } else {
            // 未来の公演がない場合でも、全タイトル用にシナリオ情報を追加
            scenarioMap.set(scenario.id, createScenarioCard(scenario, [], [], 'private_booking', isNew))
          }
        } else {
          // 公演がない場合でも、全タイトル用にシナリオ情報を追加
          scenarioMap.set(scenario.id, createScenarioCard(scenario, [], [], 'private_booking', isNew))
        }
      })
      
      const processEndTime = performance.now()
      logger.log(`⏱️ データ処理完了: ${((processEndTime - fetchEndTime) / 1000).toFixed(2)}秒`)
      
      const scenarioList = Array.from(scenarioMap.values())
      
      setScenarios(scenarioList)
      setAllEvents(publicEvents) // カレンダー用に全公演データを保存
      setStores(storesData) // 店舗データを保存
      
      const totalTime = performance.now() - startTime
      // パフォーマンスログ
      logger.log(`📊 予約サイトデータ取得完了: ${scenarioList.length}件のシナリオ, ${publicEvents.length}件の公演`)
      logger.log(`⏱️ 総処理時間: ${(totalTime / 1000).toFixed(2)}秒`)
      
      // パフォーマンス最適化: ローディングをすぐに解除（レンダリングをブロックしない）
      setIsLoading(false)
      
      if (totalTime > 3000) {
        logger.warn(`⚠️ 処理時間が3秒を超えています: ${(totalTime / 1000).toFixed(2)}秒`)
      }

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

