import { useQuery } from '@tanstack/react-query'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getColorFromName } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'
import type { ScenarioDetail, EventSchedule } from '../utils/types'

/**
 * シナリオ詳細データを取得する関数
 * パフォーマンス最適化：可能な限り並列取得
 */
async function fetchScenarioDetail(scenarioId: string, organizationSlug?: string) {
  if (!scenarioId) {
    return null
  }
  
  const startTime = performance.now()
  
  // Step 1: organizationSlugからorganization_idを取得（必須、他のクエリに必要）
  let orgId: string | undefined = undefined
  if (organizationSlug) {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', organizationSlug)
      .eq('is_active', true)
      .single()
    
    if (orgData?.id) {
      orgId = orgData.id
    }
  }
  
  // Step 2: シナリオ、スケジュール、店舗を並列取得（orgIdが必要なため、Step 1の後）
  const currentDate = new Date()
  const monthPromises = []
  
  for (let i = 0; i < 3; i++) {
    const targetDate = new Date(currentDate)
    targetDate.setMonth(currentDate.getMonth() + i)
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth() + 1
    monthPromises.push(scheduleApi.getByMonth(year, month, orgId))
  }
  
  // 🚀 並列取得: シナリオ、3ヶ月分のスケジュール、店舗を同時に取得
  const [scenarioDataResult, monthResults, storesData] = await Promise.all([
    scenarioApi.getByIdOrSlug(scenarioId, orgId).catch((error) => {
      logger.error('シナリオデータの取得エラー:', error)
      return null
    }),
    Promise.all(monthPromises).catch((error) => {
      logger.error('イベントデータの取得エラー:', error)
      return []
    }),
    storeApi.getAll(false, orgId).catch((error) => {
      logger.error('店舗データの取得エラー:', error)
      return []
    })
  ])
  
  if (!scenarioDataResult) {
    logger.error('シナリオが見つかりません')
    return null
  }
  
  const scenarioData = scenarioDataResult
  const allEvents = monthResults.flat()
  
  // このシナリオの公演をフィルタリング
  const todayJST = formatDateJST(new Date())
  
  const scenarioEvents = allEvents
    .filter((event: any) => {
      if (event.date < todayJST) return false
      
      const isMatchingScenario = 
        event.scenario_id === scenarioData.id ||
        event.scenarios?.id === scenarioData.id ||
        event.scenario === scenarioData.title
      
      if (!isMatchingScenario) return false
      if (event.is_cancelled) return false
      
      if (event.category === 'open') {
        return event.is_reservation_enabled !== false
      }
      
      if (event.category === 'private') {
        return false
      }
      
      return event.is_reservation_enabled !== false
    })
    .map((event: any) => {
      let store = event.stores
      
      if (!store) {
        store = storesData.find((s: any) => 
          s.id === event.store_id || 
          s.id === event.venue || 
          s.short_name === event.venue ||
          s.name === event.venue
        )
      }
      
      const maxParticipants = scenarioData.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      const available = maxParticipants - currentParticipants
      
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
        available_seats: available,
        reservation_deadline_hours: event.reservation_deadline_hours ?? 0,
        is_available: available > 0
      }
    })
    .sort((a: any, b: any) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.start_time.localeCompare(b.start_time)
    })
  
  // Step 3: 注意事項と関連シナリオを並列取得（シナリオデータが必要なため、Step 2の後）
  const [cautionResult, relatedScenariosResult] = await Promise.all([
    // 注意事項を取得
    (async () => {
      if (!scenarioData.scenario_master_id) return undefined
      
      try {
        // まず organization_scenarios のカスタム注意事項を取得
        if (orgId) {
          const { data: orgScenarioData } = await supabase
            .from('organization_scenarios')
            .select('custom_caution')
            .eq('scenario_master_id', scenarioData.scenario_master_id)
            .eq('organization_id', orgId)
            .maybeSingle()
          if (orgScenarioData?.custom_caution) {
            return orgScenarioData.custom_caution
          }
        }
        
        // カスタム注意事項がない場合、scenario_masters からデフォルトを取得
        const { data: masterData } = await supabase
          .from('scenario_masters')
          .select('caution')
          .eq('id', scenarioData.scenario_master_id)
          .maybeSingle()
        
        return masterData?.caution
      } catch (e) {
        logger.error('注意事項の取得エラー:', e)
        return undefined
      }
    })(),
    
    // 関連シナリオを取得
    (async () => {
      if (!scenarioData.author) return []
      
      try {
        const { data: relatedData } = await supabase
          .from('scenarios')
          .select('id, slug, title, key_visual_url, author, player_count_min, player_count_max, duration')
          .eq('author', scenarioData.author)
          .neq('id', scenarioData.id)
          .limit(6)
        
        return relatedData || []
      } catch (error) {
        logger.error('関連シナリオの取得エラー:', error)
        return []
      }
    })()
  ])
  
  const scenario: ScenarioDetail = {
    scenario_id: scenarioData.id,
    scenario_title: scenarioData.title,
    key_visual_url: scenarioData.key_visual_url,
    synopsis: scenarioData.synopsis || scenarioData.description,
    description: scenarioData.description,
    caution: cautionResult,
    author: scenarioData.author,
    genre: scenarioData.genre || [],
    duration: scenarioData.duration,
    player_count_min: scenarioData.player_count_min,
    player_count_max: scenarioData.player_count_max,
    difficulty: scenarioData.difficulty,
    rating: scenarioData.rating,
    has_pre_reading: scenarioData.has_pre_reading,
    official_site_url: scenarioData.official_site_url,
    participation_fee: scenarioData.participation_fee || 3000,
    available_stores: scenarioData.available_stores || [],
    extra_preparation_time: scenarioData.extra_preparation_time || 0
  }
  
  const endTime = performance.now()
  logger.log(`⏱️ シナリオ詳細取得完了: ${((endTime - startTime) / 1000).toFixed(2)}秒`)
  
  return {
    scenario,
    events: scenarioEvents as EventSchedule[],
    stores: storesData,
    relatedScenarios: relatedScenariosResult,
    organizationId: orgId
  }
}

/**
 * シナリオ詳細とスケジュールデータを管理するフック
 * React Queryでキャッシュを活用し、再訪問時は即座に表示
 * @param scenarioId - シナリオID
 * @param organizationSlug - 組織slug（マルチテナント対応）
 */
export function useScenarioDetail(scenarioId: string, organizationSlug?: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['scenario-detail', scenarioId, organizationSlug],
    queryFn: () => fetchScenarioDetail(scenarioId, organizationSlug),
    enabled: !!scenarioId,
    staleTime: 2 * 60 * 1000, // 2分間はfreshとみなす（スケルトン表示なし）
    gcTime: 10 * 60 * 1000, // 10分間キャッシュ保持
  })

  return {
    scenario: data?.scenario ?? null,
    events: data?.events ?? [],
    stores: data?.stores ?? [],
    relatedScenarios: data?.relatedScenarios ?? [],
    isLoading,
    loadScenarioDetail: refetch
  }
}
