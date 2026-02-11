import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'

export interface ScenarioCard {
  scenario_id: string
  scenario_slug?: string  // URL用のslug（あればこちらを使用）
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
    store_short_name?: string
    store_color?: string
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
   * @param organizationSlug - 組織slug（パス方式用）指定がない場合は全組織のデータを取得
   *
   * パフォーマンス最適化:
   * - React Queryの導入検討（キャッシュ有効活用）
   * - メモリ使用量の最適化（不要なデータは破棄）
   * - 初期表示データの制限（最初の1ヶ月のみ取得）
   */
  export function useBookingData(organizationSlug?: string) {
    const [scenarios, setScenarios] = useState<ScenarioCard[]>([])
    const [allEvents, setAllEvents] = useState<any[]>([])
    const [blockedSlots, setBlockedSlots] = useState<any[]>([]) // GMテスト等、貸切申込を受け付けない時間帯
    const [stores, setStores] = useState<any[]>([])
    const [privateBookingDeadlineDays, setPrivateBookingDeadlineDays] = useState<number>(7) // 貸切申込締切日数
    const [isLoading, setIsLoading] = useState(true)
    const [organizationId, setOrganizationId] = useState<string | null>(null)
    const [organizationNotFound, setOrganizationNotFound] = useState(false)
    const [organizationName, setOrganizationName] = useState<string | null>(null)

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
      
      // 組織slugからorganization_idを取得
      let orgId: string | null = null
      setOrganizationNotFound(false)
      if (organizationSlug) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('slug', organizationSlug)
          .eq('is_active', true)
          .single()
        
        if (orgData) {
          orgId = orgData.id
          setOrganizationId(orgId)
          setOrganizationName(orgData.name)
          logger.log(`📍 組織検出: ${organizationSlug} (ID: ${orgId}, 名前: ${orgData.name})`)
        } else {
          logger.warn(`⚠️ 組織が見つかりません: ${organizationSlug}`)
          setOrganizationNotFound(true)
          setIsLoading(false)
          return // 組織が見つからない場合は早期リターン
        }
      }
      
      // 今日から6ヶ月分のデータを取得
      // カレンダーで月切り替えができるように、先の月も含める
      // 注意: 3ヶ月だと4月目以降にデータがなくなるため6ヶ月に拡張
      const currentDate = new Date()
      const todayJST = formatDateJST(currentDate)

      // 今日から6ヶ月後までを取得
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const startDate = todayJST // 今日以降のみ取得（過去は不要）
      const endMonthDate = new Date(year, month + 5, 0) // 6ヶ月後の月末
      const endDate = formatDateJST(endMonthDate)

      const apiStartTime = performance.now()
      logger.log(`⏱️ API呼び出し開始: ${((performance.now() - apiStartTime).toFixed(2))}ms`)

      // パフォーマンス最適化: 段階的データ取得
      // 1. まずシナリオと店舗データと設定を取得（軽量、即座に表示可能）
      const fetchStartTime = performance.now()
      
      // シナリオ取得（organization_idでフィルタリング）
      const scenarioQuery = supabase
        .from('scenarios')
        .select('id, slug, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, is_shared, organization_id')
        .eq('status', 'available')
        .neq('scenario_type', 'gm_test')
      
      // 組織が指定されている場合、その組織のシナリオ OR 共有シナリオを取得
      if (orgId) {
        scenarioQuery.or(`organization_id.eq.${orgId},is_shared.eq.true`)
      }
      
      // 店舗取得（organization_idでフィルタリング）
      // オフィスのみ除外（臨時会場はオープン公演がある日のみ表示するため、取得は行う）
      // 注意: neq()はnull値も除外するため、or()で明示的にnullを含める
      let storeQuery = supabase
        .from('stores')
        .select('id, organization_id, name, short_name, address, color, capacity, rooms, ownership_type, status, is_temporary, temporary_dates, temporary_venue_names, display_order, region, transport_allowance')
        .or('ownership_type.is.null,ownership_type.neq.office')
      if (orgId) {
        storeQuery = storeQuery.eq('organization_id', orgId)
      }
      // display_orderでソート
      storeQuery = storeQuery.order('display_order', { ascending: true, nullsFirst: false })
      
      const [scenariosResult, storesResult, settingsResult] = await Promise.all([
        scenarioQuery.order('title', { ascending: true }),
        (async () => {
          try {
            const result = await storeQuery
            logger.log('📍 店舗取得結果 詳細:', {
              count: result.data?.length,
              error: result.error,
              temporary: result.data?.filter((s: any) => s.is_temporary).length,
              stores: result.data?.map((s: any) => ({ id: s.id, name: s.name, is_temporary: s.is_temporary }))
            })
            return result
          } catch (error) {
            logger.error('店舗データの取得エラー:', error)
            return { data: [], error: null }
          }
        })(),
        (async () => {
          try {
            return await supabase
              .from('reservation_settings')
              .select('private_booking_deadline_days')
              .limit(1)
              .maybeSingle()
          } catch {
            return { data: null, error: null }
          }
        })()
      ])
      
      const scenariosData = scenariosResult.data || []
      const storesData = storesResult?.data || []
      
      // 貸切申込締切日数を設定（デフォルト7日）
      if (settingsResult?.data?.private_booking_deadline_days) {
        setPrivateBookingDeadlineDays(settingsResult.data.private_booking_deadline_days)
      }
      
      const firstFetchEndTime = performance.now()
      logger.log(`⏱️ シナリオ・店舗データ取得完了: ${((firstFetchEndTime - fetchStartTime) / 1000).toFixed(2)}秒`)
      
      // 2. 店舗データを即座に設定（シナリオデータは公演データと一緒に処理）
      setStores(storesData)
      
      // 3. 公演データを取得（organization_idでフィルタリング）
      const eventsQuery = supabase
        .from('schedule_events')
        .select(`
          *,
          stores:store_id (
            id,
            name,
            short_name,
            color,
            address
          ),
          scenarios:scenario_id (
            id,
            title,
            player_count_max
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
      
      // 組織が指定されている場合、その組織の公演のみ取得
      if (orgId) {
        eventsQuery.eq('organization_id', orgId)
      }
      
      const { data: eventsData, error: eventsError } = await eventsQuery
      if (eventsError) throw eventsError
      const allEventsData = eventsData || []
      const fetchEndTime = performance.now()
      logger.log(`⏱️ 公演データ取得完了: ${((fetchEndTime - firstFetchEndTime) / 1000).toFixed(2)}秒`)
      logger.log(`⏱️ データ取得完了: ${((fetchEndTime - fetchStartTime) / 1000).toFixed(2)}秒`)
      logger.log(`📊 取得データ: シナリオ${scenariosData.length}件, 店舗${storesData.length}件, 公演${allEventsData.length}件`)
      
      // 予約可能な通常公演のみフィルタリング（貸切公演・過去時間の公演は除外）
      const now = new Date()
      const nowJST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
      const todayStr = formatDateJST(now)
      const nowHour = nowJST.getHours()
      const nowMinute = nowJST.getMinutes()

      const publicEvents = allEventsData.filter((event: any) => {
        const isNotCancelled = !event.is_cancelled
        
        // 貸切公演は予約サイトには表示しない
        const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
        if (isPrivateBooking) return false
        
        // 通常公演: category='open' かつ is_reservation_enabled=true
        const isOpenAndEnabled = (event.is_reservation_enabled !== false) && (event.category === 'open')

        // 今日の公演で開始時間を過ぎたものは非表示
        if (event.date === todayStr && event.start_time) {
          const [h, m] = event.start_time.split(':').map(Number)
          if (h < nowHour || (h === nowHour && m <= nowMinute)) {
            return false
          }
        }
        
        return isNotCancelled && isOpenAndEnabled
      })
      
      // GMテスト等、貸切申込を受け付けない時間帯をフィルタリング
      const blockedSlotsData = allEventsData.filter((event: any) => {
        const isNotCancelled = !event.is_cancelled
        // GMテスト、テストプレイは貸切申込を受け付けない
        const isBlocked = event.category === 'gmtest' || event.category === 'testplay'
        return isNotCancelled && isBlocked
      })
      
      // 最適化: 店舗データをMapに変換（O(1)アクセス）
      const storeMap = new Map<string, any>()
      storesData.forEach((store: any) => {
        storeMap.set(store.id, store)
        if (store.short_name) storeMap.set(store.short_name, store)
        if (store.name) storeMap.set(store.name, store)
      })
      
      // 最適化: シナリオデータをMapに変換（O(1)アクセス）
      const scenarioDataMap = new Map<string, any>()
      scenariosData.forEach((scenario: any) => {
        scenarioDataMap.set(scenario.id, scenario)
        if (scenario.title) scenarioDataMap.set(scenario.title, scenario)
      })
      
      // イベントを加工: player_count_max を事前計算してセット
      const enrichedEvents = publicEvents.map((event: any) => {
        // シナリオ情報を検索（ID → タイトル の順で検索）
        const scenarioFromMap = scenarioDataMap.get(event.scenario_id) || 
                                scenarioDataMap.get(event.scenario) ||
                                scenarioDataMap.get(event.scenarios?.id) ||
                                scenarioDataMap.get(event.scenarios?.title)
        
        // player_count_max: scenarioMapからの値を最優先
        const player_count_max = scenarioFromMap?.player_count_max || 
                                 event.scenarios?.player_count_max || 
                                 event.max_participants || 
                                 8
        
        // key_visual_url: scenarioMapからの値を最優先
        const key_visual_url = scenarioFromMap?.key_visual_url || 
                               event.scenarios?.key_visual_url || 
                               event.scenarios?.image_url
        
        return {
          ...event,
          player_count_max,
          key_visual_url,
          scenario_data: scenarioFromMap // シナリオマスタの情報を保持
        }
      })
      
      // 最適化: イベントをシナリオIDでインデックス化（O(1)アクセス）
      const eventsByScenarioId = new Map<string, any[]>()
      const eventsByScenarioTitle = new Map<string, any[]>()
      
      enrichedEvents.forEach((event: any) => {
        // scenario_idでインデックス化
        const scenarioId = event.scenario_id || event.scenarios?.id
        if (scenarioId) {
          if (!eventsByScenarioId.has(scenarioId)) {
            eventsByScenarioId.set(scenarioId, [])
          }
          eventsByScenarioId.get(scenarioId)!.push(event)
        }
        
        // タイトルでインデックス化（フォールバック用）
        const scenarioTitle = event.scenario || event.scenarios?.title
        if (scenarioTitle) {
          if (!eventsByScenarioTitle.has(scenarioTitle)) {
            eventsByScenarioTitle.set(scenarioTitle, [])
          }
          eventsByScenarioTitle.get(scenarioTitle)!.push(event)
        }
      })
      
      // シナリオごとにグループ化
      // 注意: todayJST は上部（106行目）で定義済み
      const scenarioMap = new Map<string, ScenarioCard>()
      
      scenariosData.forEach((scenario: any) => {
        // getPublic()で既にstatus='available'のみ取得されているため、チェック不要
        
        // 最適化: Mapから直接取得（O(1)）
        const scenarioEvents = [
          ...(eventsByScenarioId.get(scenario.id) || []),
          ...(eventsByScenarioTitle.get(scenario.title) || [])
        ]
        
        // 重複を除去（同じイベントが両方のMapに存在する可能性がある）
        const uniqueEvents = Array.from(
          new Map(scenarioEvents.map(e => [e.id, e])).values()
        )
        
        // 新着判定（リリース日から30日以内）
        const isNew = scenario.release_date ? 
          (new Date().getTime() - new Date(scenario.release_date).getTime()) / (1000 * 60 * 60 * 24) <= 30 : 
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
            // 最適化: Mapから直接取得（O(1)）- find()を完全に排除
            const store = storeMap.get(event.venue) || 
                         storeMap.get(event.store_id) ||
                         storeMap.get(event.store_short_name) ||
                         null
            
            // シナリオマスタのplayer_count_maxを使用（公演データは古い値の可能性があるため）
            const maxParticipants = scenario.player_count_max || 8
            const currentParticipants = event.current_participants || 0
            const availableSeats = event.is_private_booking === true 
              ? 0 
              : maxParticipants - currentParticipants
            
            return {
              date: event.date,
              time: event.start_time,
              store_name: store?.name || event.venue,
              store_short_name: store?.short_name,
              store_color: store?.color,
              available_seats: availableSeats
            }
          })
          
          // ステータスは最も近い公演で判定（未来の公演がある場合のみ）
          let status: 'available' | 'few_seats' | 'sold_out' | 'private_booking' = 'private_booking'
          if (sortedEvents.length > 0) {
            const nextEvent = sortedEvents[0]
            const isPrivateBooking = nextEvent.is_private_booking === true
            // シナリオマスタのplayer_count_maxを使用
            const maxParticipants = scenario.player_count_max || 8
            const currentParticipants = nextEvent.current_participants || 0
            status = isPrivateBooking ? 'sold_out' : getAvailabilityStatus(maxParticipants, currentParticipants)
          }
          
          // 未来の公演がある場合のみシナリオを追加
          // 満席の公演も含めて全ての公演をカウント
          if (nextEvents.length > 0 || targetEvents.length > 0) {
            scenarioMap.set(scenario.id, {
              scenario_id: scenario.id,
              scenario_slug: scenario.slug || undefined,
              scenario_title: scenario.title,
              key_visual_url: scenario.key_visual_url,
              author: scenario.author,
              duration: scenario.duration,
              player_count_min: scenario.player_count_min,
              player_count_max: scenario.player_count_max,
              genre: scenario.genre || [],
              participation_fee: scenario.participation_fee || 3000,
              next_events: nextEvents,
              total_events_count: targetEvents.length, // 次回公演の総数（満席も含む）
              status: status,
              is_new: isNew
            })
          } else {
            // 未来の公演がない場合でも、全タイトル用にシナリオ情報を追加
            scenarioMap.set(scenario.id, {
              scenario_id: scenario.id,
              scenario_slug: scenario.slug || undefined,
              scenario_title: scenario.title,
              key_visual_url: scenario.key_visual_url,
              author: scenario.author,
              duration: scenario.duration,
              player_count_min: scenario.player_count_min,
              player_count_max: scenario.player_count_max,
              genre: scenario.genre || [],
              participation_fee: scenario.participation_fee || 3000,
              status: 'private_booking', // 公演予定なしは「貸切受付中」
              is_new: isNew
            })
          }
        } else {
          // 公演がない場合でも、全タイトル用にシナリオ情報を追加
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_slug: scenario.slug || undefined,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            participation_fee: scenario.participation_fee || 3000,
            status: 'private_booking', // 公演予定なしは「貸切受付中」
            is_new: isNew
          })
        }
      })
      
      const processEndTime = performance.now()
      logger.log(`⏱️ データ処理完了: ${((processEndTime - fetchEndTime) / 1000).toFixed(2)}秒`)
      
      const scenarioList = Array.from(scenarioMap.values())
      
      const totalTime = performance.now() - startTime
      // パフォーマンスログ
      logger.log(`📊 予約サイトデータ取得完了: ${scenarioList.length}件のシナリオ, ${enrichedEvents.length}件の公演`)
      logger.log(`⏱️ 総処理時間: ${(totalTime / 1000).toFixed(2)}秒`)
      
      // データを即座に設定（非同期化は不要、むしろ遅延の原因になる）
      setScenarios(scenarioList)
      setAllEvents(enrichedEvents) // 加工済みイベントを使用
      setBlockedSlots(blockedSlotsData) // GMテスト等の時間帯
      setStores(storesData)
      setIsLoading(false)
      
      // パフォーマンス最適化: よく使われる画像をプリロード（バックグラウンド）
      // 新着・直近公演の画像を優先的にプリロード
      const imagesToPreload = scenarioList
        .filter(s => s.is_new || (s.next_events && s.next_events.length > 0))
        .slice(0, 10) // 最大10枚まで
        .map(s => s.key_visual_url)
        .filter((url): url is string => !!url)
      
      // バックグラウンドで画像をプリロード
      imagesToPreload.forEach(url => {
        const img = new Image()
        img.src = url
      })
      logger.log(`🖼️ 画像プリロード開始: ${imagesToPreload.length}枚`)
      
      if (totalTime > 3000) {
        logger.warn(`⚠️ 処理時間が3秒を超えています: ${(totalTime / 1000).toFixed(2)}秒`)
      }

      // デバッグ: データがない場合の警告
      if (scenarioList.length === 0) {
        logger.warn('⚠️ 表示可能なシナリオがありません')
        logger.warn('原因の可能性:')
        logger.warn('1. シナリオデータが登録されていない')
        logger.warn('2. 予約可能な公演（category=open）が登録されていない')
        logger.warn('3. is_reservation_enabledがfalseになっている')
        logger.warn('4. シナリオと公演の紐付けが正しくない')
      }
    } catch (error) {
      logger.error('データの読み込みエラー:', error)
      setIsLoading(false)
    }
  }, [organizationSlug])

  return {
    scenarios,
    allEvents,
    blockedSlots, // GMテスト等、貸切申込を受け付けない時間帯
    stores,
    privateBookingDeadlineDays, // 貸切申込締切日数
    isLoading,
    loadData,
    organizationNotFound, // 組織が見つからない場合のフラグ
    organizationName // 組織名
  }
}

