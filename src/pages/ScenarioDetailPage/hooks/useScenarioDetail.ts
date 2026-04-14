import { useQuery } from '@tanstack/react-query'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import { getColorFromName } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { fetchPublicRelatedScenariosByAuthor } from '@/lib/scenarioRelatedPublic'
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
  logger.log('[ScenarioDetail] 検索中:', { scenarioId, orgId })
  const scenarioDataResult = await scenarioApi.getByIdOrSlug(scenarioId, orgId).catch((error) => {
    logger.error('シナリオデータの取得エラー:', error)
    return null
  })
  
  if (!scenarioDataResult) {
    logger.error('シナリオが見つかりません:', { scenarioId, orgId })
    return null
  }
  
  const scenarioData = scenarioDataResult
  
  const todayJST = formatDateJST(new Date())
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 3)
  const endDateStr = formatDateJST(endDate)
  const masterId = scenarioData.scenario_master_id
  const orgScenarioId =
    (scenarioData as { org_scenario_id?: string | null }).org_scenario_id ?? null

  // ラインナップと同様に、scenario_master_id に加え organization_scenario_id・scenario 名で公演を取得してマージする
  // 公開用ビューを使用するため、リレーションではなくカラムのみを取得
  const scheduleEventSelect = `
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
          venue
        `

  async function fetchScheduleEventsMergedForScenario(): Promise<any[]> {
    const applyRangeAndOrg = (q: any) => {
      let x = q
        .gte('date', todayJST)
        .lte('date', endDateStr)
        .eq('is_cancelled', false)
      if (orgId) x = x.eq('organization_id', orgId)
      return x.order('date', { ascending: true }).order('start_time', { ascending: true })
    }

    const run = async (build: (q: any) => any) => {
      // 公開用ビューを使用（PII/財務情報を除外）
      const query = build(supabase.from('schedule_events_public').select(scheduleEventSelect))
      const { data, error } = await applyRangeAndOrg(query)
      if (error) {
        logger.error('スケジュール取得エラー:', error)
        return []
      }
      return data || []
    }

    const [byMasterId, byOrgScenarioId, byScenarioTitle] = await Promise.all([
      run((q) => q.eq('scenario_master_id', scenarioData.id)),
      orgScenarioId
        ? run((q) => q.eq('organization_scenario_id', orgScenarioId))
        : Promise.resolve([]),
      scenarioData.title
        ? run((q) => q.eq('scenario', scenarioData.title))
        : Promise.resolve([]),
    ])

    const byId = new Map<string, any>()
    for (const row of [...byMasterId, ...byOrgScenarioId, ...byScenarioTitle]) {
      byId.set(row.id, row)
    }
    return Array.from(byId.values()).sort((a, b) => {
      const d = String(a.date).localeCompare(String(b.date))
      if (d !== 0) return d
      return String(a.start_time || '').localeCompare(String(b.start_time || ''))
    })
  }

  // Step 3: イベント・店舗・関連シナリオを並列取得
  // organization_scenarios の追加カラム（characters, caution, private_booking_* 等）は
  // ビュー経由で scenarioData に含まれているため、別途取得不要
  const [eventsData, storesData, relatedScenariosResult] =
    await Promise.all([
      fetchScheduleEventsMergedForScenario(),
      // 公開用ビューを使用（コスト情報を除外）
      (orgId ? storeApi.getAllPublic(orgId) : Promise.resolve([])).catch((error) => {
        logger.error('店舗データの取得エラー:', error)
        return []
      }),
      (async () => {
        try {
          return await fetchPublicRelatedScenariosByAuthor({
            author: scenarioData.author || '',
            excludeScenarioMasterId: masterId || scenarioData.id,
            organizationId: orgId,
            limit: 6,
          })
        } catch (error) {
          logger.error('関連シナリオの取得エラー:', error)
          return []
        }
      })(),
    ])

  // 店舗マップを作成（公開用ビューではリレーションが使えないため）
  const storeMap = new Map<string, any>()
  for (const s of storesData) {
    storeMap.set(s.id, s)
  }

  // イベントデータを整形
  const scenarioEvents = eventsData
    .filter((event: any) => {
      // open公演のみ（private除外）
      if (event.category === 'private') return false
      // 予約可能な公演のみ
      return event.is_reservation_enabled !== false
    })
    .map((event: any) => {
      // 公開用ビューではリレーションが使えないため、storeMap から取得
      const store = storeMap.get(event.store_id)
      
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
  
  const scenario: ScenarioDetail = {
    scenario_master_id: masterId || scenarioData.id,
    org_scenario_id: orgScenarioId || undefined,
    slug: scenarioData.slug,
    scenario_title: scenarioData.title,
    key_visual_url: scenarioData.key_visual_url,
    synopsis: scenarioData.synopsis || scenarioData.description,
    description: scenarioData.description,
    caution: (scenarioData as any).caution || null,
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
    private_booking_blocked_slots: scenarioData.private_booking_blocked_slots || undefined,
    booking_start_date: scenarioData.booking_start_date || null,
    booking_end_date: scenarioData.booking_end_date || null,
    characters: (scenarioData as any).characters || []
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
    // 空席状況はリアルタイム性が重要なため、毎回マウント時に必ずバックグラウンド再取得
    refetchOnMount: 'always',
  })

  return {
    scenario: data?.scenario ?? null,
    events: data?.events ?? [],
    stores: data?.stores ?? [],
    relatedScenarios: data?.relatedScenarios ?? [],
    organizationId: data?.organizationId ?? undefined,
    isLoading,
    loadScenarioDetail: refetch
  }
}
