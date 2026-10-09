import { customerLookupReadApi } from '@/lib/api/customerHookReadApi'
import { snapshotAllCustomers, findManualHistoryOwner } from '@/lib/ownPlayHistory'
import { fetchBatchedIds } from '@/lib/fetchBatchedIds'
import { fetchPlayedReservations } from '@/lib/playedStatus'
import { readPrivateGroupList } from '@/lib/privateGroupRead'
import { customerPlayHistory } from '@/lib/customerPlayHistory'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { myPageSettingsReadApi } from '@/lib/api/myPageReadApi'
import { myPageDataReadApi } from '@/lib/api/myPageReadApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from '@/lib/manualPlayHistoryLimit'
import type { Reservation, Store } from '@/types'
import { summarizePrivateGroup, type PrivateGroupSummary } from '../components/PrivateBookingCards/privateGroupSummary'
import { toHandoverInfo, type MyHandoverRow, type PrivateGroupHandoverInfo } from '../components/PrivateBookingCards/privateGroupHandover'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { getErrorMessage } from '@/lib/errorFields'

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
  customerIds?: string[]
  avatarUrl: string | null
  stats: { participationCount: number; points: number }
  scheduleEvents: Record<string, { date: string; start_time: string; category?: string; is_private_booking?: boolean | null; current_participants?: number; max_participants?: number }>
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

// 紐付け/統合 RPC をセッション内で userId ごとに1回だけ実行するためのガード。
// マイページのタブ再フォーカス・再マウントのたびに RPC（auth.users 参照 + 複数テーブルの
// SELECT/UPDATE/DELETE）が走るDB負荷を避ける。RPC 失敗時は記録せず次回に再試行する。
const linkedUserIds = new Set<string>()

export function useMyPageDataQuery(userId: string | undefined, email: string | undefined) {
  return useQuery({
    queryKey: myPageKeys.data(userId ?? '', email ?? ''),
    enabled: !!(userId || email),
    queryFn: async (): Promise<MyPageData> => {
      let customer = null
      // user_id 未紐付けの自分の顧客行を SECURITY DEFINER RPC で安全に紐付ける／重複行を統合する。
      // （クライアント直 UPDATE は RLS(user_id = auth.uid()) で弾かれて機能しなかった: #308）
      // 空プロフィールの本人行が既に紐付いていても、実データを持つ未紐付け重複行を統合できるよう
      // 呼ぶ（RPC は冪等: 統合対象が無ければ何もしない）(#334)。
      // ただしタブ再フォーカス等での毎回実行を避けるため、セッション内は userId ごとに1回だけ
      // 実行する（#341）。新規に生じた重複行はリロード/次セッションで統合される。
      if (userId) {
        if (!linkedUserIds.has(userId)) {
          const { error: linkError } = await myPageSettingsReadApi.linkCurrentUserToCustomer()
          if (linkError) logger.warn('顧客レコードの自動紐付け/統合に失敗:', linkError)
          else linkedUserIds.add(userId)
        }
        // 同一 user_id の重複行が残っていても表示が非決定的にならないよう1件に絞る (#382)
        const { data, error } = await myPageDataReadApi.findOwnCustomerByUserId(userId)
        if (error && error.code !== 'PGRST116') logger.warn('顧客情報の取得に失敗:', error)
        if (data) customer = data
      }
      if (!customer && email) {
        const { data, error } = await myPageDataReadApi.findOwnCustomerByEmail(email)
        if (error && error.code !== 'PGRST116') throw error
        if (data) customer = data
      }

      if (!customer) return { reservations: [], customerInfo: null, customerId: null, avatarUrl: null, stats: { participationCount: 0, points: 0 }, scheduleEvents: {}, orgSlugs: {}, orgNames: {}, scenarioImages: {}, scenarioSlugs: {}, scenarioInfo: {}, stores: {}, playedScenarios: [], playedOverrideIds: new Set(), privateGroups: [], ratingsMap: {} }

      const { data: identities, error: identityError } = userId ? await customerLookupReadApi.listIdsByUserId(userId) : { data: [], error: null }
      if (identityError) throw identityError
      const customerIds = [...new Set([customer.id, ...(identities ?? []).map(row => row.id)])]
      const historySnapshot = snapshotAllCustomers(customerIds)
      const [reservationResult, privateGroupsResult, manualHistoryResult, ratingsResult, overridesResult, pastReservations, handoverResult] = await Promise.all([
        Promise.all(customerIds.map(id => myPageDataReadApi.listRecentReservations(id))).then(results => ({ data: results.flatMap(result => result.data ?? []).sort((a,b) => (b.requested_datetime ?? '').localeCompare(a.requested_datetime ?? '')), error: results.find(result => result.error)?.error ?? null })),
        readPrivateGroupList('joined').then(groups => ({
          data: groups.map(group => {
            const member = group.members?.find(m => m.user_id === userId && m.status === 'joined')
            return { ...member, is_organizer: member?.is_organizer ?? false, private_groups: group }
          }),
          error: null,
        })),
        historySnapshot.then(history => ({ data: history.manual, error: null })),
        Promise.all(customerIds.map(id => myPageDataReadApi.listRatings(id))).then(results => ({ data: results.flatMap(result => result.data ?? []).sort((a,b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')), error: results.find(result => result.error)?.error ?? null })),
        historySnapshot.then(history => ({ data: history.overrides, error: null })),
        Promise.all(customerIds.map(id => fetchPlayedReservations(id))).then(results => results.flat()),
        // 主催者の引き継ぎ（段階 3）。読めなくてもカードは出す
        userId ? privateGroupRpcApi.listMyHandovers() : Promise.resolve({ data: [], error: null }),
      ])

      if (reservationResult.error) throw reservationResult.error
      const reservationData = reservationResult.data || []

      // 本人/スタッフが「未体験に戻した」scenario_master_id（取得失敗はクエリ全体を失敗にする）
      const playedOverrideIds = new Set<string>(
        (overridesResult.data || []).map((o: { scenario_master_id: string }) => o.scenario_master_id).filter(Boolean)
      )
      if (overridesResult.error) logger.warn('体験済みオーバーライド取得エラー:', overridesResult.error)

      if (ratingsResult.error) throw ratingsResult.error
      const localRatingsMap: Record<string, number> = {}
      ratingsResult.data?.forEach((r) => { if (r.scenario_master_id && !(r.scenario_master_id in localRatingsMap)) localRatingsMap[r.scenario_master_id] = r.rating })

      const stats = { participationCount: pastReservations.length, points: pastReservations.length * 100 }
      const metadataReservations = [...reservationData, ...pastReservations]

      const eventIds = reservationData.map(r => r.schedule_event_id).filter((id): id is string => id !== null && id !== undefined)
      const orgIds = [...new Set(metadataReservations.map(r => r.organization_id).filter(Boolean))]
      const manualScenarioIds = (manualHistoryResult.data || []).map((m) => m.scenario_master_id ?? m.scenario_id).filter((id: string | null): id is string => id !== null && id !== undefined)
      const scenarioMasterIds = [...new Set([...metadataReservations.map(r => r.scenario_master_id).filter((id): id is string => id !== null && id !== undefined), ...manualScenarioIds])]
      const storeIdsFromReservations = [...new Set(metadataReservations.map(r => r.store_id).filter(Boolean))]
      const memberRecords = privateGroupsResult.data || []
      const groupIds = memberRecords.map(r => r.private_groups?.id).filter(Boolean)

      const [eventsResult, orgsResult, scenariosResult, privateGroupSchedulesResult] = await Promise.all([
        eventIds.length > 0 ? myPageDataReadApi.listPublicEventsByIds(eventIds) : Promise.resolve({ data: [] }),
        fetchBatchedIds(orgIds, ids => myPageDataReadApi.listOrganizationsByIds(ids)),
        fetchBatchedIds(scenarioMasterIds, ids => myPageDataReadApi.listScenarioMastersByIds(ids)),
        groupIds.length > 0 ? myPageDataReadApi.getPrivateGroupSchedules(groupIds) : Promise.resolve({ data: [] }),
      ])

      const groupSchedules = (privateGroupSchedulesResult.data || []) as Array<{ group_id: string; requested_datetime: string; store_id: string | null; store_name: string | null }>
      const groupScheduleByGroupId: Record<string, (typeof groupSchedules)[0]> = {}
      groupSchedules.forEach(s => { groupScheduleByGroupId[s.group_id] = s })

      const allStoreIds = [...new Set([...storeIdsFromReservations, ...groupSchedules.map(s => s.store_id).filter((id): id is string => !!id)])]
      const storesFetchResult = await fetchBatchedIds(allStoreIds, ids => myPageDataReadApi.listStoresByIds(ids))
      const storesData = storesFetchResult.data || []

      const scheduleEvents: MyPageData['scheduleEvents'] = {}
      eventsResult.data?.forEach((e) => { scheduleEvents[e.id] = { date: e.date, start_time: e.start_time, category: e.category, is_private_booking: e.is_private_booking, current_participants: e.current_participants, max_participants: e.max_participants } })

      const orgSlugs: Record<string, string> = {}
      const orgNames: Record<string, string> = {}
      ;(orgsResult.data ?? []).forEach(o => { if (o.slug) orgSlugs[o.id] = o.slug; if (o.name) orgNames[o.id] = o.name })

      const scenarioImages: Record<string, string> = {}
      const scenarioSlugs: Record<string, string> = {}
      const scenarioInfo: Record<string, { min: number; max: number }> = {}
      const titleToScenarioData: Record<string, { key_visual_url?: string; id?: string }> = {}
      ;(scenariosResult.data ?? []).forEach(s => {
        if (s.key_visual_url) scenarioImages[s.id] = s.key_visual_url
        scenarioSlugs[s.id] = s.id
        scenarioInfo[s.id] = { min: s.player_count_min || 1, max: s.player_count_max || 8 }
        if (s.title) titleToScenarioData[s.title] = { key_visual_url: s.key_visual_url, id: s.id }
      })

      const stores: Record<string, Store> = {}
      storesData.forEach(store => { stores[store.id] = store as Store })

      const storeNameById: Record<string, string> = {}
      storesData.forEach(s => { storeNameById[s.id] = s.name })

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
        manualHistory.forEach((item) => {
          const smId = item.scenario_master_id ?? item.scenario_id
          played.push({ scenario: item.scenario_title, date: item.played_at ?? '', venue: item.venue || '', scenario_id: smId || undefined, scenario_slug: smId || undefined, organization_slug: undefined, key_visual_url: smId ? scenarioImages[smId] : undefined, is_manual: true, manual_id: item.id, rating: smId ? (localRatingsMap[smId] ?? null) : null })
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

      if (handoverResult.error) logger.warn('主催者の引き継ぎ依頼の取得に失敗:', handoverResult.error)
      const handoverByGroupId: Record<string, PrivateGroupHandoverInfo> = {}
      ;((handoverResult.data ?? []) as MyHandoverRow[]).forEach(row => { handoverByGroupId[row.group_id] = toHandoverInfo(row) })

      const privateGroups: PrivateGroupSummary[] = []
      for (const record of memberRecords) {
        const group = record.private_groups
        if (!group || group.status === 'cancelled') continue
        privateGroups.push(summarizePrivateGroup(group, userId, groupScheduleByGroupId[group.id], storeNameById, handoverByGroupId[group.id] ?? null))
      }
      privateGroups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return {
        reservations: reservationData,
        customerInfo: { name: customer.name, nickname: customer.nickname },
        customerId: customer.id,
        customerIds,
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
      const { data: scenarios, error: scenarioError } = await myPageDataReadApi.listAvailableScenarios()
      if (scenarioError) throw scenarioError
      const uniqueScenarios = scenarios?.reduce((acc, s) => {
        if (!acc.find((item: { id: string }) => item.id === s.scenario_master_id)) acc.push({ id: s.scenario_master_id, title: s.title })
        return acc
      }, [] as { id: string; title: string }[]) || []

      const { data: storesData, error: storeError } = await myPageDataReadApi.listStores()
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
      await customerPlayHistory.add(customerId, { scenario_title: scenarioTitle, scenario_master_id: scenarioId, played_at: playedAt || null, venue: storeName })
    },
    onSuccess: () => {
      showToast.success('プレイ履歴を追加しました')
      queryClient.invalidateQueries({ queryKey: myPageKeys.data(userId ?? '', email ?? '') })
    },
    onError: (error: unknown) => {
      logger.error('手動履歴追加エラー:', error)
      showToast.error(getErrorMessage(error) || '追加に失敗しました')
    },
  })
}

export function useDeleteManualHistoryMutation(customerId: string | null, userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (manualId: string) => {
      if (!customerId) throw new Error('顧客情報が取得できません。再ログインしてお試しください。')
      const { data: identities, error: identityError } = userId ? await customerLookupReadApi.listIdsByUserId(userId) : { data: [], error: null }
      if (identityError) throw identityError
      const owner = await findManualHistoryOwner([customerId, ...(identities ?? []).map(row => row.id)], manualId)
      if (!owner) throw new Error('履歴が見つかりません。ページを再読み込みしてください。')
      const removed = await customerPlayHistory.remove(owner, manualId)
      if (!removed) throw new Error('削除できませんでした。ページを再読み込みしてから再度お試しください。')
    },
    onSuccess: () => {
      showToast.success('削除しました')
      queryClient.invalidateQueries({ queryKey: myPageKeys.data(userId ?? '', email ?? '') })
    },
    onError: (error: unknown) => {
      logger.error('手動履歴削除エラー:', error)
      showToast.error(getErrorMessage(error) || '削除に失敗しました')
    },
  })
}
