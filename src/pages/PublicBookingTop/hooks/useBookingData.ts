import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'
import { readBookingDataSnapshot, writeBookingDataSnapshot } from '../utils/bookingDataSnapshot'

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
    current_participants?: number
    is_extended?: boolean
    is_confirmed?: boolean
  }>
  total_events_count?: number // 次回公演の総数（表示用）
  status: 'available' | 'few_seats' | 'sold_out' | 'private_booking'
  is_new?: boolean
  // バッジ用フィールド
  is_recommended?: boolean  // おすすめ（管理者設定）
  favorite_count?: number   // 遊びたいリスト登録数（100以上で人気バッジ）
  release_date?: string     // リリース日（1年以上でロングセラー）
}

export interface BookingDataResult {
  scenarios: ScenarioCard[]
  allEvents: any[]
  blockedSlots: any[]
  stores: any[]
  privateBookingDeadlineDays: number
  organizationId: string | null
  organizationName: string | null
  organizationHeaderImageUrl: string | null
  organizationThemeColor: string | null
  /** DB の public_booking_hero_description（空ならフロントでデフォルト） */
  organizationPublicBookingHeroDescription: string | null
  organizationNotFound: boolean
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
 * 一般客はアクティブな組織のみ。スタッフ/管理者は RLS で許可された行なら非アクティブ組織も表示（404防止）。
 */
async function requireActiveOrgForPublicBookingUrl(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return true
  const { data: row } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  const role = row?.role as string | undefined
  if (role === 'admin' || role === 'staff' || role === 'license_admin') return false
  const { data: staffRow } = await supabase.from('staff').select('id').eq('user_id', user.id).maybeSingle()
  if (staffRow) return false
  return true
}

/**
 * 公開トップページ用のデータを取得する関数
 * React Queryでキャッシュされる
 */
async function fetchBookingData(organizationSlug?: string): Promise<BookingDataResult> {
  // 組織slugからorganization_idを取得
  let orgId: string | null = null
  let orgName: string | null = null
  let orgHeaderImageUrl: string | null = null
  let orgThemeColor: string | null = null
  let orgPublicBookingHeroDescription: string | null = null
  const organizationNotFound = false
  
  if (organizationSlug) {
    const requireActive = await requireActiveOrgForPublicBookingUrl()
    const orgData = await resolveOrganizationFromPathSegment(organizationSlug, {
      requireActive,
    })

    if (orgData) {
      orgId = orgData.id
      orgName = orgData.name
      orgHeaderImageUrl = orgData.header_image_url ?? null
      orgThemeColor = orgData.theme_color ?? null
      orgPublicBookingHeroDescription = orgData.public_booking_hero_description ?? null
    } else {
      return {
        scenarios: [],
        allEvents: [],
        blockedSlots: [],
        stores: [],
        privateBookingDeadlineDays: 7,
        organizationId: null,
        organizationName: null,
        organizationHeaderImageUrl: null,
        organizationThemeColor: null,
        organizationPublicBookingHeroDescription: null,
        organizationNotFound: true
      }
    }
  }
  
  // 今日から3ヶ月分のデータを取得
  const currentDate = new Date()
  const todayJST = formatDateJST(currentDate)
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const startDate = todayJST
  const endMonthDate = new Date(year, month + 2, 0) // 3ヶ月後の月末
  const endDate = formatDateJST(endMonthDate)

  // 🚀 パフォーマンス最適化: 全クエリを並列実行
  const [
    scenariosResult,
    storesResult,
    settingsResult,
    availableOrgResult,
    likesCountResult,
    eventsResult
  ] = await Promise.all([
    // 1. シナリオ取得（organization_scenarios_with_master: 基本情報 + 組織固有設定）
    (async () => {
      try {
        let query = supabase
          .from('organization_scenarios_with_master')
          .select('id, slug, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, is_shared, organization_id, scenario_master_id, is_recommended')
          .eq('status', 'available')
          .neq('scenario_type', 'gm_test')
        
        if (orgId) {
          query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
        }
        
        return await query.order('title', { ascending: true })
      } catch (err) {
        console.error('scenarios query error:', err)
        return { data: [], error: err }
      }
    })(),
    
    // 2. 店舗取得
    (async () => {
      try {
        let query = supabase
          .from('stores')
          .select('id, organization_id, name, short_name, address, color, capacity, rooms, ownership_type, status, is_temporary, temporary_dates, temporary_venue_names, display_order, region, transport_allowance')
          .or('ownership_type.is.null,ownership_type.neq.office')
        
        if (orgId) {
          query = query.eq('organization_id', orgId)
        }
        
        const result = await query.order('display_order', { ascending: true, nullsFirst: false })
        if (result.error) {
          console.error('stores query failed:', result.error)
        }
        return result
      } catch (err) {
        console.error('stores query error:', err)
        return { data: [], error: err }
      }
    })(),
    
    // 3. 設定取得
    supabase
      .from('reservation_settings')
      .select('private_booking_deadline_days')
      .limit(1)
      .maybeSingle(),
    
    // 4. 公開中の組織シナリオキー取得
    (async () => {
      try {
        return await supabase.rpc('get_public_available_scenario_keys')
      } catch (err) {
        console.error('get_public_available_scenario_keys RPC error:', err)
        return { data: [], error: err }
      }
    })(),
    
    // 5. 🚀 最適化: RPCで遊びたいリスト数を集計（全件取得を回避）
    (async () => {
      try {
        return await supabase.rpc('get_scenario_likes_count')
      } catch (err) {
        console.error('get_scenario_likes_count RPC error:', err)
        return { data: [], error: err }
      }
    })(),
    
    // 6. 公演データ取得
    (async () => {
      try {
        let query = supabase
          .from('schedule_events')
          .select(`
            id,
            date,
            start_time,
            end_time,
            scenario_master_id,
            scenario_id,
            scenario,
            store_id,
            venue,
            current_participants,
            is_cancelled,
            is_reservation_enabled,
            category,
            is_private_booking,
            is_extended,
            reservation_deadline_hours,
            organization_id
          `)
          .gte('date', startDate)
          .lte('date', endDate)
          .eq('is_cancelled', false)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
        
        if (orgId) {
          query = query.eq('organization_id', orgId)
        }
        
        const result = await query
        if (result.error) {
          console.error('schedule_events query failed:', result.error)
        }
        return result
      } catch (err) {
        console.error('schedule_events query error:', err)
        return { data: [], error: err }
      }
    })()
  ])
  
  // 公開中の組織シナリオのキーセットを作成
  const availableOrgKeysData = availableOrgResult.data || []
  const availableOrgKeys = new Set(
    availableOrgKeysData.map((os: any) => `${os.organization_id}_${os.scenario_master_id}`)
  )
  const orgStatusMap = new Map<string, string>()
  availableOrgKeysData.forEach((os: any) => {
    orgStatusMap.set(`${os.organization_id}_${os.scenario_master_id}`, os.org_status || 'available')
  })
  
  const shouldFilterByOrgStatus = !availableOrgResult.error && availableOrgKeysData.length > 0
  
  // 遊びたいリスト数をMapに変換（🚀 RPC結果を使用、エラー時はフォールバック）
  const favoriteCountMap = new Map<string, number>()
  if (likesCountResult.data && !likesCountResult.error) {
    likesCountResult.data.forEach((item: { scenario_id: string; likes_count: number }) => {
      favoriteCountMap.set(item.scenario_id, Number(item.likes_count))
    })
  } else if (likesCountResult.error) {
    // RPCが失敗した場合はフォールバックとしてscenario_likesを直接取得
    console.warn('get_scenario_likes_count RPC failed, falling back to direct query')
    try {
      const { data: likesData } = await supabase
        .from('scenario_likes')
        .select('scenario_id')
      if (likesData) {
        likesData.forEach((like: { scenario_id: string }) => {
          favoriteCountMap.set(like.scenario_id, (favoriteCountMap.get(like.scenario_id) || 0) + 1)
        })
      }
    } catch (err) {
      console.error('scenario_likes fallback query error:', err)
    }
  }
  
  // シナリオをフィルタリング
  const scenariosData = (scenariosResult.data || []).filter((s: any) => {
    if (!shouldFilterByOrgStatus) {
      return s.status === 'available'
    }
    if (!s.scenario_master_id) return s.status === 'available'
    return availableOrgKeys.has(`${s.organization_id}_${s.scenario_master_id}`)
  })
  
  const storesData = storesResult?.data || []
  const privateBookingDeadlineDays = settingsResult?.data?.private_booking_deadline_days || 7
  const allEventsData = eventsResult?.data || []
  
  // 予約可能な通常公演のみフィルタリング
  const now = new Date()
  const nowJST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const todayStr = formatDateJST(now)
  const nowHour = nowJST.getHours()
  const nowMinute = nowJST.getMinutes()

  const publicEvents = allEventsData.filter((event: any) => {
    // 貸切公演は予約サイトには表示しない
    const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
    if (isPrivateBooking) return false
    
    // 通常公演・出張公演: category='open' or 'offsite' かつ is_reservation_enabled=true
    const isOpenAndEnabled = (event.is_reservation_enabled !== false) && (event.category === 'open' || event.category === 'offsite')

    // 今日の公演で開始時間を過ぎたものは非表示
    if (event.date === todayStr && event.start_time) {
      const [h, m] = event.start_time.split(':').map(Number)
      if (h < nowHour || (h === nowHour && m <= nowMinute)) {
        return false
      }
    }
    
    return isOpenAndEnabled
  })
  
  // GMテスト・貸切公演等
  const blockedSlotsData = allEventsData.filter((event: any) => {
    const isBlocked = event.category === 'gmtest' 
      || event.category === 'testplay'
      || event.category === 'private'
      || event.is_private_booking === true
    return isBlocked
  })
  
  // 最適化: 店舗データをMapに変換
  const storeMap = new Map<string, any>()
  storesData.forEach((store: any) => {
    storeMap.set(store.id, store)
    if (store.short_name) storeMap.set(store.short_name, store)
    if (store.name) storeMap.set(store.name, store)
  })
  
  // 最適化: シナリオデータをMapに変換
  const scenarioDataMap = new Map<string, any>()
  scenariosData.forEach((scenario: any) => {
    scenarioDataMap.set(scenario.id, scenario)
    if (scenario.title) scenarioDataMap.set(scenario.title, scenario)
  })
  
  // storesをMapに変換（ID→店舗データ）
  const storesMap = new Map<string, any>()
  storesData.forEach((store: any) => {
    storesMap.set(store.id, store)
  })
  
  // イベントを加工
  const enrichedEvents = publicEvents.map((event: any) => {
    const scenarioFromMap = scenarioDataMap.get(event.scenario_master_id) || 
                            scenarioDataMap.get(event.scenario_id) || 
                            scenarioDataMap.get(event.scenario)
    
    const player_count_max = scenarioFromMap?.player_count_max || 8
    const key_visual_url = scenarioFromMap?.key_visual_url
    
    // 店舗情報を追加
    const store = storesMap.get(event.store_id)
    
    return {
      ...event,
      player_count_max,
      key_visual_url,
      scenario_data: scenarioFromMap,
      store_name: store?.name || event.venue,
      store_short_name: store?.short_name,
      store_color: store?.color
    }
  })
  
  // イベントをシナリオIDでインデックス化
  const eventsByScenarioId = new Map<string, any[]>()
  const eventsByScenarioTitle = new Map<string, any[]>()
  
  enrichedEvents.forEach((event: any) => {
    const scenarioId = event.scenario_master_id || event.scenario_id
    if (scenarioId) {
      if (!eventsByScenarioId.has(scenarioId)) {
        eventsByScenarioId.set(scenarioId, [])
      }
      eventsByScenarioId.get(scenarioId)!.push(event)
    }
    
    const scenarioTitle = event.scenario
    if (scenarioTitle) {
      if (!eventsByScenarioTitle.has(scenarioTitle)) {
        eventsByScenarioTitle.set(scenarioTitle, [])
      }
      eventsByScenarioTitle.get(scenarioTitle)!.push(event)
    }
  })
  
  // シナリオカードを構築
  const scenarioMap = new Map<string, ScenarioCard>()
  
  scenariosData.forEach((scenario: any) => {
    const scenarioKey = `${scenario.organization_id}_${scenario.scenario_master_id}`
    const currentOrgStatus = orgStatusMap.get(scenarioKey) || 'available'
    
    const scenarioEvents = [
      ...(eventsByScenarioId.get(scenario.id) || []),
      ...(eventsByScenarioTitle.get(scenario.title) || [])
    ]
    
    const uniqueEvents = Array.from(
      new Map(scenarioEvents.map(e => [e.id, e])).values()
    )
    
    const isNew = scenario.release_date ? 
      (new Date().getTime() - new Date(scenario.release_date).getTime()) / (1000 * 60 * 60 * 24) <= 30 : 
      false
    
    // coming_soonシナリオ
    if (currentOrgStatus === 'coming_soon') {
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
        status: 'private_booking',
        is_new: isNew,
        is_recommended: scenario.is_recommended || false,
        favorite_count: favoriteCountMap.get(scenario.id) || 0,
        release_date: scenario.release_date
      })
      return
    }
    
    // 公演がある場合
    if (uniqueEvents.length > 0) {
      const futureEvents = uniqueEvents.filter((event: any) => {
        const isFuture = event.date >= todayJST
        const isNotPrivate = !(event.is_private_booking === true || event.category === 'private')
        const isNotGmTest = event.category !== 'gmtest'
        return isFuture && isNotPrivate && isNotGmTest
      })
      
      const sortedEvents = [...futureEvents].sort((a: any, b: any) => {
        const dateCompare = a.date.localeCompare(b.date)
        if (dateCompare !== 0) return dateCompare
        return (a.start_time || '').localeCompare(b.start_time || '')
      })
      
      const nextEvents = sortedEvents.slice(0, 10).map((event: any) => {
        const store = storeMap.get(event.venue) || 
                     storeMap.get(event.store_id) ||
                     null
        
        const maxParticipants = scenario.player_count_max || 8
        const minParticipants = scenario.player_count_min || 1
        const currentParticipants = event.current_participants || 0
        const availableSeats = event.is_private_booking === true 
          ? 0 
          : maxParticipants - currentParticipants
        const isConfirmed = currentParticipants >= minParticipants && currentParticipants < maxParticipants
        
        return {
          date: event.date,
          time: event.start_time,
          store_name: store?.name || event.venue,
          store_short_name: store?.short_name,
          store_color: store?.color,
          available_seats: availableSeats,
          current_participants: currentParticipants,
          is_extended: event.is_extended || false,
          is_confirmed: isConfirmed
        }
      })
      
      let status: 'available' | 'few_seats' | 'sold_out' | 'private_booking' = 'private_booking'
      if (sortedEvents.length > 0) {
        const nextEvent = sortedEvents[0]
        const isPrivateBooking = nextEvent.is_private_booking === true
        const maxParticipants = scenario.player_count_max || 8
        const currentParticipants = nextEvent.current_participants || 0
        status = isPrivateBooking ? 'sold_out' : getAvailabilityStatus(maxParticipants, currentParticipants)
      }
      
      if (nextEvents.length > 0 || futureEvents.length > 0) {
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
          total_events_count: futureEvents.length,
          status: status,
          is_new: isNew,
          is_recommended: scenario.is_recommended || false,
          favorite_count: favoriteCountMap.get(scenario.id) || 0,
          release_date: scenario.release_date
        })
      } else {
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
          status: 'private_booking',
          is_new: isNew,
          is_recommended: scenario.is_recommended || false,
          favorite_count: favoriteCountMap.get(scenario.id) || 0,
          release_date: scenario.release_date
        })
      }
    } else {
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
        status: 'private_booking',
        is_new: isNew,
        is_recommended: scenario.is_recommended || false,
        favorite_count: favoriteCountMap.get(scenario.id) || 0,
        release_date: scenario.release_date
      })
    }
  })
  
  const scenarioList = Array.from(scenarioMap.values())
  
  return {
    scenarios: scenarioList,
    allEvents: enrichedEvents,
    blockedSlots: blockedSlotsData,
    stores: storesData,
    privateBookingDeadlineDays,
    organizationId: orgId,
    organizationName: orgName,
    organizationHeaderImageUrl: orgHeaderImageUrl,
    organizationThemeColor: orgThemeColor,
    organizationPublicBookingHeroDescription: orgPublicBookingHeroDescription,
    organizationNotFound
  }
}

/**
 * 公演データの取得と管理を行うフック
 * React Queryでキャッシュを活用
 *
 * @param organizationSlug - 組織slug（パス方式用）指定がない場合は全組織のデータを取得
 */
export function useBookingData(organizationSlug?: string) {
  const initialSnapshot = useMemo(
    () => (organizationSlug ? readBookingDataSnapshot(organizationSlug) : null),
    [organizationSlug]
  )

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['booking-data', organizationSlug],
    queryFn: () => fetchBookingData(organizationSlug),
    initialData: initialSnapshot?.data,
    initialDataUpdatedAt: initialSnapshot?.savedAt,
    staleTime: 2 * 60 * 1000, // 2分間キャッシュ（再訪問時は即座に表示）
    gcTime: 10 * 60 * 1000, // 10分間メモリ保持
    // グローバル refetchOnMount: false を上書き: スナップショット表示後も必ず裏で再取得
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (data && organizationSlug && !data.organizationNotFound) {
      writeBookingDataSnapshot(organizationSlug, data)
    }
  }, [data, organizationSlug])

  return {
    scenarios: data?.scenarios ?? [],
    allEvents: data?.allEvents ?? [],
    blockedSlots: data?.blockedSlots ?? [],
    stores: data?.stores ?? [],
    privateBookingDeadlineDays: data?.privateBookingDeadlineDays ?? 7,
    isLoading,
    isFetching,
    loadData: refetch,
    organizationNotFound: data?.organizationNotFound ?? false,
    organizationName: data?.organizationName ?? null,
    organizationHeaderImageUrl: data?.organizationHeaderImageUrl ?? null,
    organizationThemeColor: data?.organizationThemeColor ?? null,
    organizationPublicBookingHeroDescription: data?.organizationPublicBookingHeroDescription ?? null
  }
}
