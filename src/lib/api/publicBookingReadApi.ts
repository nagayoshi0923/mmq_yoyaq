/**
 * 予約サイトのトップ（シナリオ・店舗・公演の一覧）の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const publicBookingReadApi = {
  /** ユーザーの役割 */
  async findUserRole(userId: string) {
    return supabase.from('users').select('role').eq('id', userId).maybeSingle()
  },

  /** ユーザーのスタッフ行の id */
  async findStaffId(userId: string) {
    return supabase.from('staff').select('id').eq('user_id', userId).maybeSingle()
  },

  /** 貸切予約の受付締切日数（RPC。組織指定） */
  async getPrivateBookingDeadlineDays(organizationId: string | null) {
    return supabase.rpc('get_private_booking_deadline_days', {
        p_organization_id: organizationId,
        p_organization_slug: null,
      })
  },

  /** シナリオごとのお気に入り数（RPC） */
  async getScenarioLikesCount() {
    return supabase.rpc('get_scenario_likes_count')
  },

  /** お気に入りのシナリオ id（RPC が失敗したときの代替） */
  async listScenarioLikes() {
    return supabase
      .from('scenario_likes')
      .select('scenario_id')
  },

  /** 店舗の公演募集停止期間 */
  async listPerformancePauses(storeIds: string[]) {
    return supabase
      .from('store_recruitment_pauses')
      .select('store_id, pause_type, starts_on, ends_on')
      .in('store_id', storeIds)
      .eq('pause_type', 'performance')
  },

  /** 店舗の貸切募集停止期間（I6。トップ・作品ページの「貸切受付中」で、上演できる店舗がすべて停止中かを見る） */
  async listPrivatePauses(storeIds: string[]) {
    return supabase
      .from('store_recruitment_pauses')
      .select('store_id, organization_id, pause_type, starts_on, ends_on')
      .in('store_id', storeIds)
      .eq('pause_type', 'private')
  },
}

/** 公開用の公演の行を、組織が分かればその組織に絞る（店舗トップの公演の取得と、先の月の上限の取得で共通） */
function inOrganization<Q extends { eq: (column: string, value: string) => Q }>(query: Q, organizationId: string | null | undefined): Q {
  return organizationId ? query.eq('organization_id', organizationId) : query
}

export const publicBookingListReadApi = {
  /** 公開中のシナリオ（ガイド用を除く）を題名順。組織が分かれば絞る */
  async listAvailableScenarios(organizationId: string | null | undefined) {
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('id, slug, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, is_shared, organization_id, scenario_master_id, is_recommended, weekend_duration, participation_costs, created_at, available_from, available_until, master_status')
      .eq('status', 'available')
      .neq('scenario_type', 'gm_test')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query.order('title', { ascending: true })
  },
  /** 店舗（公開用ビュー。コスト情報を除く）を表示順。組織が分かれば絞る */
  async listPublicStores(organizationId: string | null | undefined) {
    let query = supabase
      .from('stores_public')
      .select('id, organization_id, name, short_name, address, color, capacity, rooms, status, is_temporary, temporary_dates, temporary_venue_names, display_order, region, public_name')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query.order('display_order', { ascending: true, nullsFirst: false })
  },
  /**
   * 期間内の公演（公開用ビュー。PII・財務情報を除く）。組織が分かれば絞る。
   * 1 回の取得は最大 1000 件で打ち切られるので、日付・開始・id の順を固定して 1000 件ずつ最後まで読む
   * （2026-10-25: 月送り・「もっと見る」で期間を伸ばすと 1000 件を超え得る）。途中で失敗したら、それまでの行と error を返す。
   */
  async listPublicEventsInRange(startDate: string, endDate: string, organizationId: string | null | undefined) {
    const pageSize = 1000
    const fetchPage = (page: number) => {
      const query = supabase
        .from('schedule_events_public')
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
            published,
            category,
            is_private_booking,
            is_extended,
            reservation_deadline_hours,
            organization_id,
            max_participants,
            capacity
          `)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_cancelled', false)
      return inOrganization(query, organizationId)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .order('id', { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1)
    }
    type Row = NonNullable<Awaited<ReturnType<typeof fetchPage>>['data']>[number]
    const rows: Row[] = []
    for (let page = 0; ; page++) {
      const { data, error } = await fetchPage(page)
      if (error) return { data: rows, error }
      rows.push(...(data ?? []))
      if (!data || data.length < pageSize) break
    }
    return { data: rows, error: null }
  },
  /**
   * 予約を受け付けている公開の公演（オープン・出張）のうち、いちばん先の日付（組織を渡せばその組織）。無ければ null。
   * カレンダー・リストの月送りと「もっと見る」をどこまで進めるかに使う（取得していない先の月へ空のまま進めない）。
   */
  async latestPublicOpenEventDate(organizationId: string | null | undefined, fromDate: string) {
    const query = supabase
      .from('schedule_events_public')
      .select('date')
      .gte('date', fromDate)
      .eq('is_cancelled', false)
      .in('category', ['open', 'offsite'])
      .not('published', 'is', false)
      .not('is_reservation_enabled', 'is', false)
      .not('is_private_booking', 'is', true)
    const { data, error } = await inOrganization(query, organizationId).order('date', { ascending: false }).limit(1)
    return { date: (data?.[0]?.date as string | undefined) ?? null, error }
  },
  /**
   * 作品の次の公開の公演（予約を受け付けているオープン・出張。今日以降を日付・開始・id の順に offset から limit 件）。組織を渡せばその組織。
   * 新作一覧のカードに、検索の期間（30 日・最初の 3 か月・55 日）より先の次回公演を出すのに使う（2026-10-26 社長報告）。
   * 募集停止・締切などは呼び出し側で既存の判定にかけるので、足りなければ次の offset を読む
   */
  async listNextPublicOpenEvents(scenarioMasterId: string, organizationId: string | null | undefined, fromDate: string, offset: number, limit: number) {
    const query = supabase
      .from('schedule_events_public')
      .select('id, date, start_time, end_time, scenario_master_id, scenario_id, scenario, store_id, venue, current_participants, is_cancelled, is_reservation_enabled, published, category, is_private_booking, is_extended, reservation_deadline_hours, organization_id, max_participants, capacity')
      .eq('scenario_master_id', scenarioMasterId)
      .gte('date', fromDate)
      .eq('is_cancelled', false)
      .in('category', ['open', 'offsite'])
      .not('published', 'is', false)
      .not('is_reservation_enabled', 'is', false)
      .not('is_private_booking', 'is', true)
    return inOrganization(query, organizationId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
  },
  /**
   * 全組織の期間内の公演（公開用ビュー）。全体トップの横断検索用。
   * 1 回の取得は最大 1000 件で打ち切られるため、id 順を固定して 1000 件ずつ最大 maxPages 回読む
   * （「もっと見る」で期間を伸ばすので 5 → 20 ページ。上限に達したら記録する）。
   */
  async listAllPublicEventsInRange(startDate: string, endDate: string, maxPages = 20) {
    const pageSize = 1000
    const fetchPage = (page: number) => supabase
      .from('schedule_events_public')
      .select('id, date, start_time, end_time, scenario_master_id, scenario, store_id, venue, current_participants, max_participants, capacity, is_reservation_enabled, published, category, is_private_booking, is_extended, reservation_deadline_hours, organization_id')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .in('category', ['open', 'offsite'])
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    type Row = NonNullable<Awaited<ReturnType<typeof fetchPage>>['data']>[number]
    const rows: Row[] = []
    for (let page = 0; page < maxPages; page++) {
      const { data, error } = await fetchPage(page)
      if (error) return { data: rows, error }
      rows.push(...(data ?? []))
      if (!data || data.length < pageSize) break
      if (page === maxPages - 1) console.warn('[listAllPublicEventsInRange] ページの上限に達しました', { startDate, endDate, rows: rows.length })
    }
    return { data: rows, error: null }
  },
}
