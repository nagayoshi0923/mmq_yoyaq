import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from '@/lib/manualPlayHistoryLimit'
import type { Reservation, Store } from '@/types'

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  scenario_id?: string
  scenario_slug?: string
  organization_slug?: string
  key_visual_url?: string
  is_manual?: boolean
  manual_id?: string
  reservation_id?: string
  rating?: number | null
}

interface PrivateGroupSummary {
  id: string
  name: string | null
  invite_code: string
  status: string
  scenario_title: string | null
  scenario_image: string | null
  scenario_player_count_max: number | null
  member_count: number
  is_organizer: boolean
  created_at: string
  reservation_id?: string | null
  confirmed_schedule_line?: string | null
  member_displays?: Array<{ name: string; is_organizer: boolean }>
  candidate_dates_count: number
}

function playedScenarioListDedupeKey(p: PlayedScenario): string {
  if (p.is_manual && p.manual_id) return `manual:${p.manual_id}`
  if (p.reservation_id) return `res:${p.reservation_id}`
  if (p.scenario_id) return `scenario:${p.scenario_id}:${p.date ?? 'nodate'}:${p.is_manual ? 'm' : 'r'}`
  return `row:${p.scenario}:${p.date ?? ''}:${p.venue ?? ''}:${p.is_manual ? 'm' : 'r'}`
}

export interface MyPageData {
  reservations: Reservation[]
  customerInfo: { name?: string; nickname?: string } | null
  customerId: string | null
  avatarUrl: string | null
  stats: { participationCount: number; points: number }
  scheduleEvents: Record<string, { date: string; start_time: string; category?: string; current_participants?: number; max_participants?: number }>
  orgSlugs: Record<string, string>
  orgNames: Record<string, string>
  scenarioImages: Record<string, string>
  scenarioSlugs: Record<string, string>
  scenarioInfo: Record<string, { min: number; max: number }>
  stores: Record<string, Store>
  playedScenarios: PlayedScenario[]
  /** 本人/スタッフが「未体験に戻した」scenario_master_id 集合（アルバム非表示・体験済み判定で差し引く） */
  playedOverrideIds: Set<string>
  privateGroups: PrivateGroupSummary[]
  ratingsMap: Record<string, number>
}

export const myPageKeys = {
  data: (userId: string, email: string) => ['mypage-data', userId, email] as const,
  albumOptions: () => ['mypage-album-options'] as const,
}

export function useMyPageDataQuery(userId: string | undefined, email: string | undefined) {
  return useQuery({
    queryKey: myPageKeys.data(userId ?? '', email ?? ''),
    enabled: !!(userId || email),
    queryFn: async (): Promise<MyPageData> => {
      let customer = null
      // user_id 未紐付けの自分の顧客行を SECURITY DEFINER RPC で安全に紐付ける／重複行を統合する。
      // （クライアント直 UPDATE は RLS(user_id = auth.uid()) で弾かれて機能しなかった: #308）
      // 空プロフィールの本人行が既に紐付いていても、実データを持つ未紐付け重複行を統合できるよう、
      // 本人行の有無に関わらず毎回呼ぶ（RPC は冪等: 統合対象が無ければ何もしない）(#334)
      if (userId) {
        const { error: linkError } = await supabase.rpc('link_current_user_to_customer')
        if (linkError) logger.warn('顧客レコードの自動紐付け/統合に失敗:', linkError)
        const { data } = await supabase.from('customers').select('id, name, nickname, avatar_url, user_id, organization_id').eq('user_id', userId).maybeSingle()
        if (data) customer = data
      }
      if (!customer && email) {
        const { data, error } = await supabase.from('customers').select('id, name, nickname, avatar_url, user_id, organization_id').ilike('email', email).maybeSingle()
        if (error && error.code !== 'PGRST116') throw error
        if (data) customer = data
      }

      if (!customer) return { reservations: [], customerInfo: null, customerId: null, avatarUrl: null, stats: { participationCount: 0, points: 0 }, scheduleEvents: {}, orgSlugs: {}, orgNames: {}, scenarioImages: {}, scenarioSlugs: {}, scenarioInfo: {}, stores: {}, playedScenarios: [], playedOverrideIds: new Set(), privateGroups: [], ratingsMap: {} }

      const [reservationResult, privateGroupsResult, manualHistoryResult, ratingsResult, overridesResult] = await Promise.all([
        supabase.from('reservations').select('id, organization_id, reservation_number, title, scenario_id, scenario_master_id, store_id, schedule_event_id, requested_datetime, duration, participant_count, status, candidate_datetimes, reservation_source, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, created_at, updated_at').eq('customer_id', customer.id).order('requested_datetime', { ascending: false }).limit(50),
        supabase.from('private_group_members').select(`id, is_organizer, status, group_id, private_groups:group_id (id, name, invite_code, status, created_at, reservation_id, scenario_masters:scenario_master_id (id, title, key_visual_url, player_count_max))`).eq('user_id', userId!).eq('status', 'joined'),
        supabase.from('manual_play_history').select('id, scenario_title, played_at, venue, scenario_id, scenario_master_id').eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER),
        supabase.from('scenario_ratings').select('scenario_master_id, rating').eq('customer_id', customer.id),
        supabase.from('customer_played_overrides').select('scenario_master_id').eq('customer_id', customer.id),
      ])

      if (reservationResult.error) throw reservationResult.error
      const reservationData = reservationResult.data || []

      // 本人/スタッフが「未体験に戻した」scenario_master_id（取得失敗時は空＝従来どおり全表示）
      const playedOverrideIds = new Set<string>(
        (overridesResult.data || []).map((o: { scenario_master_id: string }) => o.scenario_master_id).filter(Boolean)
      )
      if (overridesResult.error) logger.warn('体験済みオーバーライド取得エラー:', overridesResult.error)

      const localRatingsMap: Record<string, number> = {}
      ratingsResult.data?.forEach((r: any) => { if (r.scenario_master_id) localRatingsMap[r.scenario_master_id] = r.rating })

      const confirmedPast = reservationData.filter(r => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed')
      const stats = { participationCount: confirmedPast.length, points: confirmedPast.length * 100 }

      const eventIds = reservationData.map(r => r.schedule_event_id).filter((id): id is string => id !== null && id !== undefined)
      const orgIds = [...new Set(reservationData.map(r => r.organization_id).filter(Boolean))]
      const manualScenarioIds = (manualHistoryResult.data || []).map((m: any) => m.scenario_master_id ?? m.scenario_id).filter((id: string | null): id is string => id !== null && id !== undefined)
      const scenarioMasterIds = [...new Set([...reservationData.map(r => r.scenario_master_id).filter((id): id is string => id !== null && id !== undefined), ...manualScenarioIds])]
      const storeIdsFromReservations = [...new Set(reservationData.map(r => r.store_id).filter(Boolean))]
      const memberRecords = privateGroupsResult.data || []
      const groupIds = memberRecords.map(r => (r.private_groups as any)?.id).filter(Boolean)

      const [eventsResult, orgsResult, scenariosResult, privateGroupSchedulesResult, membersDetailResult, candidateDatesResult] = await Promise.all([
        eventIds.length > 0 ? supabase.from('schedule_events_public').select('id, date, start_time, category, current_participants, max_participants').in('id', eventIds) : Promise.resolve({ data: [] }),
        orgIds.length > 0 ? supabase.from('organizations').select('id, slug, name').in('id', orgIds) : Promise.resolve({ data: [] }),
        scenarioMasterIds.length > 0 ? supabase.from('scenario_masters').select('id, title, key_visual_url, player_count_min, player_count_max').in('id', scenarioMasterIds) : Promise.resolve({ data: [] }),
        groupIds.length > 0 ? supabase.rpc('get_private_group_schedules', { p_group_ids: groupIds }) : Promise.resolve({ data: [] }),
        groupIds.length > 0 ? supabase.from('private_group_members').select('group_id, guest_name, user_id, is_organizer, status, joined_at').in('group_id', groupIds).eq('status', 'joined').order('joined_at', { ascending: true }) : Promise.resolve({ data: [] }),
        groupIds.length > 0 ? supabase.from('private_group_candidate_dates').select('group_id').in('group_id', groupIds) : Promise.resolve({ data: [] as { group_id: string }[] }),
      ])

      const groupSchedules = (privateGroupSchedulesResult.data || []) as Array<{ group_id: string; requested_datetime: string; store_id: string | null; store_name: string | null }>
      const groupScheduleByGroupId: Record<string, (typeof groupSchedules)[0]> = {}
      groupSchedules.forEach(s => { groupScheduleByGroupId[s.group_id] = s })

      const allStoreIds = [...new Set([...storeIdsFromReservations, ...groupSchedules.map(s => s.store_id).filter((id): id is string => !!id)])]
      const storesFetchResult = allStoreIds.length > 0 ? await supabase.from('stores').select('id, name, address, color').in('id', allStoreIds) : { data: [] }
      const storesData = storesFetchResult.data || []

      const scheduleEvents: MyPageData['scheduleEvents'] = {}
      eventsResult.data?.forEach((e: any) => { scheduleEvents[e.id] = { date: e.date, start_time: e.start_time, category: e.category, current_participants: e.current_participants, max_participants: e.max_participants } })

      const orgSlugs: Record<string, string> = {}
      const orgNames: Record<string, string> = {}
      ;(orgsResult.data as any[])?.forEach(o => { if (o.slug) orgSlugs[o.id] = o.slug; if (o.name) orgNames[o.id] = o.name })

      const scenarioImages: Record<string, string> = {}
      const scenarioSlugs: Record<string, string> = {}
      const scenarioInfo: Record<string, { min: number; max: number }> = {}
      const titleToScenarioData: Record<string, { key_visual_url?: string; id?: string }> = {}
      ;(scenariosResult.data as any[])?.forEach(s => {
        if (s.key_visual_url) scenarioImages[s.id] = s.key_visual_url
        scenarioSlugs[s.id] = s.id
        scenarioInfo[s.id] = { min: s.player_count_min || 1, max: s.player_count_max || 8 }
        if (s.title) titleToScenarioData[s.title] = { key_visual_url: s.key_visual_url, id: s.id }
      })

      const stores: Record<string, Store> = {}
      storesData.forEach(store => { stores[store.id] = store as Store })

      const storeNameById: Record<string, string> = {}
      storesData.forEach(s => { storeNameById[s.id] = s.name })

      const formatConfirmedScheduleLine = (groupStatus: string, groupId: string): string | null => {
        if (!['confirmed', 'booking_requested'].includes(groupStatus)) return null
        const s = groupScheduleByGroupId[groupId]
        if (!s?.requested_datetime) return null
        const raw = s.requested_datetime
        const iso = raw.includes('+') || raw.endsWith('Z') ? raw : `${raw.slice(0, 10)}T${(raw.match(/T(\d{2}:\d{2})/)?.[1] || '12:00')}:00+09:00`
        const d = new Date(iso)
        const dateStr = d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' })
        const hm = raw.match(/T(\d{2}:\d{2})/)
        const timeStr = hm ? `${hm[1]}〜` : ''
        const store = s.store_name || (s.store_id ? storeNameById[s.store_id] : '')
        const line = [dateStr, timeStr, store].filter(Boolean).join(' ')
        if (groupStatus === 'booking_requested') return line ? `申込内容: ${line}` : null
        return line || null
      }

      const membersDetailRows = (membersDetailResult.data || []) as Array<{ group_id: string; guest_name: string | null; user_id: string | null; is_organizer: boolean; status: string; joined_at: string | null }>
      const candidateCountByGroup: Record<string, number> = {}
      ;(candidateDatesResult.data || []).forEach((row: { group_id: string }) => { if (row.group_id) candidateCountByGroup[row.group_id] = (candidateCountByGroup[row.group_id] || 0) + 1 })

      const memberCountMap: Record<string, number> = {}
      const membersByGroupId: Record<string, typeof membersDetailRows> = {}
      membersDetailRows.forEach(m => {
        memberCountMap[m.group_id] = (memberCountMap[m.group_id] || 0) + 1
        if (!membersByGroupId[m.group_id]) membersByGroupId[m.group_id] = []
        membersByGroupId[m.group_id].push(m)
      })

      const memberUserIds = [...new Set(membersDetailRows.map(m => m.user_id).filter(Boolean) as string[])]
      const displayByUserId: Record<string, string> = {}
      if (memberUserIds.length > 0) {
        const { data: nameRows, error: nameRpcError } = await supabase.rpc('get_user_display_names', { user_ids: memberUserIds })
        if (nameRpcError) logger.warn('get_user_display_names RPC エラー:', nameRpcError)
        else (nameRows as { user_id: string; display_name: string }[] | null)?.forEach(row => { if (row.user_id && row.display_name?.trim()) displayByUserId[row.user_id] = row.display_name.trim() })
      }

      const buildMemberDisplays = (gid: string) => {
        const rows = membersByGroupId[gid] || []
        return rows.map(m => {
          const fromGuest = m.guest_name?.trim()
          const fromUser = m.user_id ? displayByUserId[m.user_id] : ''
          return { name: fromGuest || fromUser || '参加者', is_organizer: m.is_organizer }
        })
      }

      const pastReservations = reservationData.filter(r => new Date(r.requested_datetime) < new Date() && (r.status === 'confirmed' || r.status === 'gm_confirmed'))
      const played: PlayedScenario[] = pastReservations.map(reservation => {
        const scenarioMasterId = reservation.scenario_master_id
        const title = reservation.title?.replace(/【貸切希望】/g, '').replace(/（候補\d+件）/g, '').trim() || ''
        const scenarioData = scenarioMasterId ? { key_visual_url: scenarioImages[scenarioMasterId], slug: scenarioMasterId } : null
        const titleFallback = title ? titleToScenarioData[title] : null
        return {
          scenario: title,
          date: reservation.requested_datetime.split('T')[0],
          venue: storesData.find(s => s.id === reservation.store_id)?.name || '店舗情報なし',
          scenario_id: scenarioMasterId || titleFallback?.id || undefined,
          scenario_slug: scenarioData?.slug || titleFallback?.id || undefined,
          organization_slug: reservation.organization_id ? orgSlugs[reservation.organization_id] : undefined,
          key_visual_url: scenarioData?.key_visual_url || titleFallback?.key_visual_url || undefined,
          is_manual: false,
          reservation_id: reservation.id,
          rating: (scenarioMasterId || titleFallback?.id) ? (localRatingsMap[(scenarioMasterId || titleFallback?.id)!] ?? null) : null,
        }
      })

      const manualHistory = manualHistoryResult.data
      if (manualHistoryResult.error) logger.error('手動プレイ履歴の取得エラー:', manualHistoryResult.error)
      if (manualHistory?.length) {
        manualHistory.forEach((item: any) => {
          const smId = item.scenario_master_id ?? item.scenario_id
          played.push({ scenario: item.scenario_title, date: item.played_at, venue: item.venue || '', scenario_id: smId || undefined, scenario_slug: smId || undefined, organization_slug: undefined, key_visual_url: smId ? scenarioImages[smId] : undefined, is_manual: true, manual_id: item.id, rating: smId ? (localRatingsMap[smId] ?? null) : null })
        })
      }

      const listDedupeKeys = new Set<string>()
      const uniquePlayed = played
        .sort((a, b) => {
          if (a.is_manual && !a.date && !(b.is_manual && !b.date)) return -1
          if (b.is_manual && !b.date && !(a.is_manual && !a.date)) return 1
          if (!a.date && !b.date) return 0
          if (!a.date) return 1
          if (!b.date) return -1
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        })
        .filter(p => { const k = playedScenarioListDedupeKey(p); if (listDedupeKeys.has(k)) return false; listDedupeKeys.add(k); return true })
        .slice(0, MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER)

      const privateGroups: PrivateGroupSummary[] = []
      for (const record of memberRecords) {
        const group = record.private_groups as any
        if (!group || group.status === 'cancelled') continue
        const scenario = group.scenario_masters as any
        privateGroups.push({
          id: group.id, name: group.name, invite_code: group.invite_code, status: group.status,
          scenario_title: scenario?.title || null, scenario_image: scenario?.key_visual_url || null, scenario_player_count_max: scenario?.player_count_max || null,
          member_count: memberCountMap[group.id] || 0, is_organizer: record.is_organizer, created_at: group.created_at,
          reservation_id: group.reservation_id ?? null, confirmed_schedule_line: formatConfirmedScheduleLine(group.status, group.id),
          member_displays: buildMemberDisplays(group.id), candidate_dates_count: candidateCountByGroup[group.id] || 0,
        })
      }
      privateGroups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return {
        reservations: reservationData,
        customerInfo: { name: customer.name, nickname: customer.nickname },
        customerId: customer.id,
        avatarUrl: customer.avatar_url || null,
        stats,
        scheduleEvents,
        orgSlugs,
        orgNames,
        scenarioImages,
        scenarioSlugs,
        scenarioInfo,
        stores,
        playedScenarios: uniquePlayed,
        playedOverrideIds,
        privateGroups,
        ratingsMap: localRatingsMap,
      }
    },
  })
}

export function useMyPageAlbumOptionsQuery(enabled: boolean) {
  return useQuery({
    queryKey: myPageKeys.albumOptions(),
    enabled,
    queryFn: async () => {
      const { data: scenarios, error: scenarioError } = await supabase.from('organization_scenarios_with_master').select('scenario_master_id, title, org_status').eq('org_status', 'available').order('title')
      if (scenarioError) throw scenarioError
      const uniqueScenarios = scenarios?.reduce((acc, s) => {
        if (!acc.find((item: { id: string }) => item.id === s.scenario_master_id)) acc.push({ id: s.scenario_master_id, title: s.title })
        return acc
      }, [] as { id: string; title: string }[]) || []

      const { data: storesData, error: storeError } = await supabase.from('stores').select('id, name, short_name, is_temporary').order('name')
      if (storeError) throw storeError
      const filteredStores = (storesData || []).filter(store => !store.is_temporary || store.short_name === '臨時1' || store.name === '臨時会場1')
      return { scenarioOptions: uniqueScenarios, storeOptions: filteredStores.map(s => ({ id: s.id, name: s.name })) }
    },
  })
}

export function useAddManualHistoryMutation(customerId: string | null, userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ scenarioId, scenarioOptions, playedAt, storeId, storeOptions }: { scenarioId: string; scenarioOptions: { id: string; title: string }[]; playedAt: string; storeId: string; storeOptions: { id: string; name: string }[] }) => {
      if (!customerId) throw new Error('顧客情報が取得できません')
      const manualCount = await countManualPlayHistoryForCustomer(customerId)
      if (isManualPlayHistoryAtCap(manualCount)) throw new Error(`手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`)
      const scenarioTitle = scenarioOptions.find(s => s.id === scenarioId)?.title || ''
      const storeName = storeOptions.find(s => s.id === storeId)?.name || null
      const { data, error } = await supabase.from('manual_play_history').insert({ customer_id: customerId, scenario_title: scenarioTitle, scenario_master_id: scenarioId, played_at: playedAt || null, venue: storeName }).select()
      if (error) throw error
      if (!data?.length) throw new Error('データの追加に失敗しました（権限エラーの可能性）')
    },
    onSuccess: () => {
      showToast.success('プレイ履歴を追加しました')
      queryClient.invalidateQueries({ queryKey: myPageKeys.data(userId ?? '', email ?? '') })
    },
    onError: (error: any) => {
      logger.error('手動履歴追加エラー:', error)
      showToast.error(error.message || '追加に失敗しました')
    },
  })
}

export function useDeleteManualHistoryMutation(customerId: string | null, userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (manualId: string) => {
      if (!customerId) throw new Error('顧客情報が取得できません。再ログインしてお試しください。')
      const { data, error } = await supabase.from('manual_play_history').delete().eq('id', manualId).eq('customer_id', customerId).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('削除できませんでした。ページを再読み込みしてから再度お試しください。')
    },
    onSuccess: () => {
      showToast.success('削除しました')
      queryClient.invalidateQueries({ queryKey: myPageKeys.data(userId ?? '', email ?? '') })
    },
    onError: (error: any) => {
      logger.error('手動履歴削除エラー:', error)
      showToast.error(error.message || '削除に失敗しました')
    },
  })
}
