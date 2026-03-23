import { useQuery } from '@tanstack/react-query'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
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
    const orgData = await resolveOrganizationFromPathSegment(organizationSlug, {
      requireActive: true,
    })
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
  
  const todayJST = formatDateJST(new Date())
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 3)
  const endDateStr = formatDateJST(endDate)
  const masterId = scenarioData.scenario_master_id

  // Step 3+4 をまとめて並列（従来はイベント取得完了後に注意事項等を取りに行っていた）
  const [eventsData, storesData, orgScenarioResult, masterCautionResult, relatedScenariosResult] =
    await Promise.all([
      (async () => {
        let query = supabase
          .from('schedule_events')
          .select(
            `
          id,
          date,
          start_time,
          end_time,
          category,
          is_reservation_enabled,
          is_cancelled,
          scenario_master_id,
          organization_id,
          store_id,
          current_participants,
          reservation_deadline_hours,
          venue,
          stores:store_id (
            id,
            name,
            short_name,
            color,
            address
          )
        `
          )
          .eq('scenario_master_id', scenarioData.id)
          .gte('date', todayJST)
          .lte('date', endDateStr)
          .eq('is_cancelled', false)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })

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
      }),
      (async () => {
        if (!masterId) return null
        try {
          if (orgId) {
            const { data: orgScenarioData } = await supabase
              .from('organization_scenarios')
              .select('custom_caution, characters, private_booking_blocked_slots')
              .eq('scenario_master_id', masterId)
              .eq('organization_id', orgId)
              .maybeSingle()
            return orgScenarioData
          }
          const { data: orgScenarioRows } = await supabase
            .from('organization_scenarios')
            .select('custom_caution, characters, private_booking_blocked_slots')
            .eq('scenario_master_id', masterId)
            .not('characters', 'is', null)
            .limit(1)
          return orgScenarioRows?.[0] || null
        } catch (e) {
          logger.error('organization_scenarios取得エラー:', e)
          return null
        }
      })(),
      (async () => {
        if (!masterId) return null
        try {
          const { data: masterData } = await supabase
            .from('scenario_masters')
            .select('caution')
            .eq('id', masterId)
            .maybeSingle()
          return masterData?.caution ?? null
        } catch (e) {
          logger.error('マスター注意事項の取得エラー:', e)
          return null
        }
      })(),
      (async () => {
        if (!scenarioData.author) return []
        try {
          const { data: relatedData } = await supabase
            .from('scenario_masters')
            .select('id, title, key_visual_url, author, player_count_min, player_count_max, official_duration')
            .eq('author', scenarioData.author)
            .neq('id', masterId || scenarioData.id)
            .limit(6)

          return (relatedData || []).map((r) => ({
            ...r,
            slug: r.id,
            duration: r.official_duration,
          }))
        } catch (error) {
          logger.error('関連シナリオの取得エラー:', error)
          return []
        }
      })(),
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
  
  // 注意事項: organization_scenariosのカスタム注意事項を優先、なければマスターから
  const cautionResult = orgScenarioResult?.custom_caution || masterCautionResult
  
  // キャラクター: organization_scenariosから取得
  const charactersResult = orgScenarioResult?.characters || []
  
  const scenario: ScenarioDetail = {
    scenario_id: scenarioData.id,
    slug: scenarioData.slug,
    scenario_title: scenarioData.title,
    key_visual_url: scenarioData.key_visual_url,
    synopsis: scenarioData.synopsis || scenarioData.description,
    description: scenarioData.description,
    caution: cautionResult,
    author: scenarioData.author,
    genre: scenarioData.genre || [],
    duration: scenarioData.duration,
    weekend_duration:
      typeof scenarioData.weekend_duration === 'number' && scenarioData.weekend_duration > 0
        ? scenarioData.weekend_duration
        : null,
    player_count_min: scenarioData.player_count_min,
    player_count_max: scenarioData.player_count_max,
    difficulty: scenarioData.difficulty,
    rating: scenarioData.rating,
    has_pre_reading: scenarioData.has_pre_reading,
    official_site_url: scenarioData.official_site_url,
    participation_fee: scenarioData.participation_fee || 3000,
    participation_costs: scenarioData.participation_costs || undefined,
    available_stores: scenarioData.available_stores || [],
    extra_preparation_time: scenarioData.extra_preparation_time || 0,
    private_booking_time_slots: scenarioData.private_booking_time_slots || undefined,
    private_booking_blocked_slots: orgScenarioResult?.private_booking_blocked_slots || undefined,
    characters: charactersResult
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
