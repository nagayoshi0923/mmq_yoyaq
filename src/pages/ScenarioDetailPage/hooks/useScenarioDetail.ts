import { useQuery } from '@tanstack/react-query'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getColorFromName } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'
import type { ScenarioDetail, EventSchedule } from '../utils/types'

/**
 * シナリオ詳細データを取得する関数
 */
async function fetchScenarioDetail(scenarioId: string, organizationSlug?: string) {
  if (!scenarioId) {
    return null
  }
  
  // organizationSlugからorganization_idを取得
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
  
  // シナリオを取得（IDまたはslugで、organization_idでフィルタリング）
  const scenarioDataResult = await scenarioApi.getByIdOrSlug(scenarioId, orgId).catch((error) => {
    logger.error('シナリオデータの取得エラー:', error)
    return null
  })
  
  if (!scenarioDataResult) {
    logger.error('シナリオが見つかりません')
    return null
  }
  
  const scenarioData = scenarioDataResult
  
  // 現在の日付から3ヶ月先までの期間を計算
  const currentDate = new Date()
  const monthPromises = []
  
  // 現在の月から3ヶ月先までの公演を並列取得（パフォーマンス最適化）
  for (let i = 0; i < 3; i++) {
    const targetDate = new Date(currentDate)
    targetDate.setMonth(currentDate.getMonth() + i)
    
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth() + 1
    
    monthPromises.push(scheduleApi.getByMonth(year, month, orgId))
  }
  
  // 3ヶ月分のデータを並列取得
  const monthResults = await Promise.all(monthPromises).catch((error) => {
    logger.error('イベントデータの取得エラー:', error)
    return []
  })
  
  const allEvents = monthResults.flat()
  
  // 店舗データを取得（貸切リクエストタブでも使用するため、全店舗を取得）
  let storesData: any[] = []
  try {
    storesData = await storeApi.getAll(false, orgId)
  } catch (error) {
    logger.error('店舗データの取得エラー:', error)
    storesData = []
  }
  
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
  
  // 注意事項を取得
  let caution: string | undefined = undefined
  if (scenarioData.scenario_master_id) {
    try {
      if (orgId) {
        const { data: orgScenarioData } = await supabase
          .from('organization_scenarios')
          .select('custom_caution')
          .eq('scenario_master_id', scenarioData.scenario_master_id)
          .eq('organization_id', orgId)
          .maybeSingle()
        if (orgScenarioData?.custom_caution) {
          caution = orgScenarioData.custom_caution
        }
      }
      
      if (!caution) {
        const { data: masterData } = await supabase
          .from('scenario_masters')
          .select('caution')
          .eq('id', scenarioData.scenario_master_id)
          .maybeSingle()
        if (masterData?.caution) {
          caution = masterData.caution
        }
      }
    } catch (e) {
      logger.error('注意事項の取得エラー:', e)
    }
  }
  
  const scenario: ScenarioDetail = {
    scenario_id: scenarioData.id,
    scenario_title: scenarioData.title,
    key_visual_url: scenarioData.key_visual_url,
    synopsis: scenarioData.synopsis || scenarioData.description,
    description: scenarioData.description,
    caution,
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
  
  // 同じ著者の他作品を取得
  let relatedScenarios: any[] = []
  if (scenarioData.author) {
    try {
      const { data: relatedData } = await supabase
        .from('scenarios')
        .select('id, slug, title, key_visual_url, author, player_count_min, player_count_max, duration')
        .eq('author', scenarioData.author)
        .neq('id', scenarioData.id)
        .limit(6)
      
      relatedScenarios = relatedData || []
    } catch (error) {
      logger.error('関連シナリオの取得エラー:', error)
    }
  }
  
  return {
    scenario,
    events: scenarioEvents as EventSchedule[],
    stores: storesData,
    relatedScenarios,
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
