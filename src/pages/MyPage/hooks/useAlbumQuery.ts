import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from '@/lib/manualPlayHistoryLimit'

export interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  gms: string[]
  scenario_id?: string
  key_visual_url?: string
  author?: string
  is_manual?: boolean
  manual_id?: string
  reservation_id?: string
  character_name?: string
  played_character_id?: string
  character_record_id?: string
}

export interface LikedScenario {
  id: string
  scenario_id: string
  created_at: string
  scenario: {
    id: string
    slug?: string
    title: string
    description: string
    author: string
    duration: number
    player_count_min: number
    player_count_max: number
    difficulty: number
    genre: string[]
    rating: number
    play_count: number
    key_visual_url?: string
  }
}

export const albumKeys = {
  main: (email: string) => ['album', 'main', email] as const,
  options: () => ['album', 'options'] as const,
  characters: (scenarioId: string) => ['album', 'characters', scenarioId] as const,
}

export function useAlbumQuery(email: string | undefined) {
  return useQuery({
    queryKey: albumKeys.main(email ?? ''),
    enabled: !!email,
    queryFn: async () => {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name')
        .eq('email', email!)
        .maybeSingle()
      if (customerError) throw customerError
      if (!customer) return { playedScenarios: [], likedScenariosList: [], likedScenarios: new Set<string>(), customerId: null }

      const customerId = customer.id

      // いいね
      const { data: likes } = await supabase.from('scenario_likes').select('scenario_id').eq('customer_id', customerId)
      const likedScenarios = new Set<string>(likes?.map(l => l.scenario_id) ?? [])

      // いいね詳細
      const { data: likesData, error: likesError } = await supabase
        .from('scenario_likes')
        .select('id, scenario_id, scenario_master_id, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })

      let likedScenariosList: LikedScenario[] = []
      if (!likesError && likesData?.length) {
        const masterIds = likesData.map(l => (l as { scenario_master_id?: string }).scenario_master_id ?? l.scenario_id).filter(Boolean)
        const { data: scenariosData } = await supabase.from('scenario_masters').select('id, title, description, author, official_duration, player_count_min, player_count_max, difficulty, genre, key_visual_url').in('id', masterIds)
        likedScenariosList = likesData.map(like => {
          const masterId = (like as { scenario_master_id?: string }).scenario_master_id ?? like.scenario_id
          const scenario = scenariosData?.find(s => s.id === masterId)
          return {
            id: like.id, scenario_id: like.scenario_id, created_at: like.created_at,
            scenario: scenario ? { ...scenario, duration: (scenario as any).official_duration ?? 0, rating: 0, play_count: 0 }
              : { id: masterId ?? like.scenario_id, title: '不明', description: '', author: '', duration: 0, player_count_min: 0, player_count_max: 0, difficulty: 0, genre: [], rating: 0, play_count: 0 },
          }
        })
      }

      // 予約
      const { data: reservations, error: reservationsError } = await supabase
        .from('reservations')
        .select('id, requested_datetime, title, scenario_id, scenario_master_id, duration')
        .eq('customer_id', customerId)
        .in('status', ['confirmed', 'gm_confirmed'])
        .lte('requested_datetime', new Date().toISOString())
        .order('requested_datetime', { ascending: false })
      if (reservationsError) throw reservationsError

      const scenarios: PlayedScenario[] = []

      if (reservations?.length) {
        const titles = reservations.map(r => r.title).filter((t): t is string => !!t)
        const titleToScenarioMap: Record<string, { key_visual_url?: string; author?: string; id: string }> = {}
        if (titles.length) {
          const { data: scenariosByTitle } = await supabase.from('scenario_masters').select('id, title, key_visual_url, author').in('title', titles)
          scenariosByTitle?.forEach(s => { titleToScenarioMap[s.title] = { key_visual_url: s.key_visual_url, author: s.author, id: s.id } })
        }

        for (const reservation of reservations) {
          const dateStr = new Date(reservation.requested_datetime).toISOString().split('T')[0]
          const { data: event, error: eventError } = await supabase.from('schedule_events_public').select('scenario, date, venue').eq('date', dateStr).eq('scenario', reservation.title).maybeSingle()
          let keyVisualUrl: string | null = null, author: string | null = null, finalScenarioId: string | null = null
          if (reservation.scenario_master_id) {
            const { data: sd } = await supabase.from('scenario_masters').select('key_visual_url, author').eq('id', reservation.scenario_master_id).maybeSingle()
            keyVisualUrl = sd?.key_visual_url || null; author = sd?.author || null; finalScenarioId = reservation.scenario_master_id
          }
          if (!keyVisualUrl && reservation.title && titleToScenarioMap[reservation.title]) {
            const fb = titleToScenarioMap[reservation.title]
            keyVisualUrl = fb.key_visual_url || null; author = fb.author || null; finalScenarioId = finalScenarioId || fb.id
          }
          const reservationId = (reservation as any).id
          scenarios.push(!eventError && event
            ? { scenario: event.scenario, date: event.date, venue: event.venue, gms: [], scenario_id: finalScenarioId || undefined, key_visual_url: keyVisualUrl || undefined, author: author || undefined, reservation_id: reservationId }
            : { scenario: reservation.title, date: dateStr, venue: '店舗不明', gms: [], scenario_id: finalScenarioId || undefined, key_visual_url: keyVisualUrl || undefined, author: author || undefined, reservation_id: reservationId }
          )
        }
      }

      // 手動履歴
      const { data: manualHistory } = await supabase
        .from('manual_play_history')
        .select('id, scenario_title, played_at, venue, scenario_id, scenario_master_id, scenario_masters:scenario_master_id(key_visual_url, author)')
        .eq('customer_id', customerId)
        .order('played_at', { ascending: false })
        .limit(MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER)
      manualHistory?.forEach((item: any) => {
        const master = item.scenario_masters as { key_visual_url?: string; author?: string } | null
        scenarios.push({ scenario: item.scenario_title, date: item.played_at, venue: item.venue || '', gms: [], scenario_id: (item.scenario_master_id ?? item.scenario_id) || undefined, key_visual_url: master?.key_visual_url || undefined, author: master?.author || undefined, is_manual: true, manual_id: item.id })
      })

      // 配役記録
      const { data: charRecords } = await supabase.from('album_character_records').select('id, reservation_id, manual_play_history_id, character_id, character_name').eq('customer_id', customerId)
      if (charRecords?.length) {
        const byReservation = new Map(charRecords.filter(r => r.reservation_id).map(r => [r.reservation_id!, r]))
        const byManual = new Map(charRecords.filter(r => r.manual_play_history_id).map(r => [r.manual_play_history_id!, r]))
        scenarios.forEach(s => {
          const rec = s.reservation_id ? byReservation.get(s.reservation_id) : s.manual_id ? byManual.get(s.manual_id) : undefined
          if (rec) { s.character_name = rec.character_name; s.played_character_id = rec.character_id || undefined; s.character_record_id = rec.id }
        })
      }

      scenarios.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      return { playedScenarios: scenarios, likedScenariosList, likedScenarios, customerId }
    },
  })
}

export function useAlbumOptionsQuery() {
  return useQuery({
    queryKey: albumKeys.options(),
    queryFn: async () => {
      const { data: scenarios, error: scenarioError } = await supabase.from('organization_scenarios_with_master').select('scenario_master_id, title').eq('org_status', 'available').order('title')
      if (scenarioError) throw scenarioError
      const uniqueScenarios = scenarios?.reduce((acc, s) => {
        if (!acc.find((item: { id: string }) => item.id === s.scenario_master_id)) acc.push({ id: s.scenario_master_id, title: s.title })
        return acc
      }, [] as { id: string; title: string }[]) || []

      const { data: stores, error: storeError } = await supabase.from('stores').select('id, name, short_name, is_temporary').order('name')
      if (storeError) throw storeError
      const filteredStores = (stores || []).filter(s => !s.is_temporary || s.short_name === '臨時1' || s.name === '臨時会場1')
      return { scenarioOptions: uniqueScenarios, storeOptions: filteredStores.map(s => ({ id: s.id, name: s.name })) }
    },
  })
}

export function useScenarioCharactersQuery(scenarioId: string | undefined) {
  return useQuery({
    queryKey: albumKeys.characters(scenarioId ?? ''),
    enabled: !!scenarioId,
    queryFn: async () => {
      const { data } = await supabase.from('scenario_characters').select('id, name').eq('scenario_master_id', scenarioId!).eq('is_visible', true).order('sort_order')
      return data?.map(c => ({ id: c.id, name: c.name })) ?? []
    },
  })
}

export function useAddManualHistoryMutation(customerId: string | null, scenarioOptions: { id: string; title: string }[], storeOptions: { id: string; name: string }[], organizationId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ scenarioId, playedAt, storeId, rating, characterId, characterOptions }: { scenarioId: string; playedAt: string; storeId: string; rating: number; characterId: string; characterOptions: { id: string; name: string }[] }) => {
      if (!customerId) throw new Error('顧客情報が取得できません')
      const manualCount = await countManualPlayHistoryForCustomer(customerId)
      if (isManualPlayHistoryAtCap(manualCount)) throw new Error(`手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`)
      const scenarioTitle = scenarioOptions.find(s => s.id === scenarioId)?.title || ''
      const storeName = storeOptions.find(s => s.id === storeId)?.name || null
      const { data: insertedHistory, error } = await supabase.from('manual_play_history').insert({ customer_id: customerId, scenario_title: scenarioTitle, scenario_id: null, scenario_master_id: scenarioId, played_at: playedAt || null, venue: storeName }).select('id').single()
      if (error) throw error
      if (insertedHistory && characterId) {
        const charName = characterOptions.find(c => c.id === characterId)?.name || ''
        await supabase.from('album_character_records').insert({ customer_id: customerId, manual_play_history_id: insertedHistory.id, character_id: characterId, character_name: charName })
      }
      if (rating > 0) await supabase.from('scenario_ratings').upsert({ customer_id: customerId, scenario_master_id: scenarioId, rating }, { onConflict: 'customer_id,scenario_master_id' })
    },
    onSuccess: () => {
      showToast.success('プレイ履歴を追加しました')
      queryClient.invalidateQueries({ queryKey: albumKeys.main(email ?? '') })
    },
    onError: (error: any) => {
      logger.error('手動履歴追加エラー:', error)
      showToast.error(error.message || '追加に失敗しました')
    },
  })
}

export function useSaveCharacterMutation(customerId: string | null, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ play, characterId, characterOptions }: { play: PlayedScenario; characterId: string; characterOptions: { id: string; name: string }[] }) => {
      if (!customerId) throw new Error()
      const characterName = characterOptions.find(c => c.id === characterId)?.name || ''
      if (play.character_record_id) {
        if (!characterId) {
          const { error } = await supabase.from('album_character_records').delete().eq('id', play.character_record_id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('album_character_records').update({ character_id: characterId, character_name: characterName, updated_at: new Date().toISOString() }).eq('id', play.character_record_id)
          if (error) throw error
        }
      } else if (characterId) {
        const insertData: Record<string, string> = { customer_id: customerId, character_id: characterId, character_name: characterName }
        if (play.reservation_id) insertData.reservation_id = play.reservation_id
        else if (play.manual_id) insertData.manual_play_history_id = play.manual_id
        const { error } = await supabase.from('album_character_records').insert(insertData)
        if (error) throw error
      }
    },
    onSuccess: () => {
      showToast.success('配役を保存しました')
      queryClient.invalidateQueries({ queryKey: albumKeys.main(email ?? '') })
    },
    onError: (error: any) => {
      logger.error('配役保存エラー:', error)
      showToast.error('保存に失敗しました')
    },
  })
}

export function useDeleteManualHistoryMutation(customerId: string | null, email: string | undefined) {
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
      queryClient.invalidateQueries({ queryKey: albumKeys.main(email ?? '') })
    },
    onError: (error: any) => {
      logger.error('手動履歴削除エラー:', error)
      showToast.error(error.message || '削除に失敗しました')
    },
  })
}

export function useToggleLikeMutation(customerId: string | null, organizationId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ scenarioId, isLiked }: { scenarioId: string; isLiked: boolean }) => {
      if (isLiked) {
        const { error } = await supabase.from('scenario_likes').delete().eq('customer_id', customerId!).eq('scenario_id', scenarioId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('scenario_likes').insert({ customer_id: customerId!, scenario_id: scenarioId, organization_id: organizationId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: albumKeys.main(email ?? '') })
    },
    onError: (error: any) => {
      logger.error('いいね切り替えエラー:', error)
      showToast.error('操作に失敗しました')
    },
  })
}

export function useRemoveLikeMutation(email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (likeId: string) => {
      const { error } = await supabase.from('scenario_likes').delete().eq('id', likeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: albumKeys.main(email ?? '') })
    },
    onError: (error: any) => {
      logger.error('削除エラー:', error)
      showToast.error('削除に失敗しました')
    },
  })
}
