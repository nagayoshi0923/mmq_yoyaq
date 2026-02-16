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
  
  // Step 2: まずシナリオを取得（IDが必要なため）
  const scenarioDataResult = await scenarioApi.getByIdOrSlug(scenarioId, orgId).catch((error) => {
    logger.error('シナリオデータの取得エラー:', error)
    return null
  })
  
  if (!scenarioDataResult) {
    logger.error('シナリオが見つかりません')
    return null
  }
  
  const scenarioData = scenarioDataResult
  
  // Step 3: シナリオIDを使ってスケジュールと店舗を並列取得（効率化：シナリオIDでフィルタ）
  const todayJST = formatDateJST(new Date())
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 3)
  const endDateStr = formatDateJST(endDate)
  
  // 🚀 シナリオIDで直接フィルタしてスケジュール取得（全イベント取得を回避）
  const [eventsData, storesData] = await Promise.all([
    (async () => {
      let query = supabase
        .from('schedule_events')
        .select(`
          *,
          stores:store_id (
            id,
            name,
            short_name,
            color,
            address
          )
        `)
        .eq('scenario_id', scenarioData.id)
        .gte('date', todayJST)
        .lte('date', endDateStr)
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
      
      // 組織フィルタ（指定がある場合のみ）
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query
      if (error) {
        logger.error('スケジュール取得エラー:', error)
        return []
      }
      return data || []
    })(),
    storeApi.getAll(false, orgId).catch((error) => {
      logger.error('店舗データの取得エラー:', error)
      return []
    })
  ])
  
  // イベントデータを整形
  const scenarioEvents = eventsData
    .filter((event: any) => {
      // open公演のみ（private除外）
      if (event.category === 'private') return false
      // 予約可能な公演のみ
      return event.is_reservation_enabled !== false
    })
    .map((event: any) => {
      const store = event.stores
      
      const maxParticipants = scenarioData.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      const available = maxParticipants - currentParticipants
      
      const storeColorName = store?.color
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
  
  // Step 4: 注意事項と関連シナリオを並列取得（シナリオデータが必要なため）
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
