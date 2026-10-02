/**
 * 予約の読み取りAPI（画面・部品から supabase.from('reservations') を直接呼ばず、ここを通す。整備 Phase 2、#773）
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_WITH_CUSTOMER_SELECT_FIELDS } from '@/lib/reservationApi'

export const reservationReadApi = {
  /** コマンドパレット: 予約番号・顧客名・題名の部分一致で最大5件（pattern は % 付き） */
  async searchForPalette(organizationId: string, pattern: string) {
    return supabase
      .from('reservations')
      .select('id, reservation_number, customer_name, title, status, actual_datetime')
      .eq('organization_id', organizationId)
      .or(`customer_name.ilike.${pattern},reservation_number.ilike.${pattern},title.ilike.${pattern}`)
      .order('actual_datetime', { ascending: false })
      .limit(5)
  },
  /** 予約 ID から、顧客つきで1件（有効な状態のみ。配列で返る） */
  async listActiveWithCustomerById(reservationId: string) {
    return supabase
      .from('reservations')
      .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
      .eq('id', reservationId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])
  },
  /** 名前の候補用: 顧客メモが空でない予約の顧客メモと参加者名。組織が分かれば絞る */
  async listCustomerNotes(organizationId?: string | null) {
    let query = supabase
      .from('reservations')
      .select('customer_notes, participant_names')
      .not('customer_notes', 'is', null)
      .not('customer_notes', 'eq', '')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query
  },
}

export interface AdminReservationListParams {
  organizationId: string | null | undefined
  statusFilter: string
  paymentFilter: string
  typeFilter: string
  /** PostgREST 用に無害化した検索語。空なら検索しない */
  searchTerm: string
  from: number
  to: number
}

export const reservationAdminReadApi = {
  /** 予約管理画面の一覧（サーバー側のフィルタ・ページング・件数つき） */
  async listPage(params: AdminReservationListParams) {
    let query = supabase
      .from('reservations')
      .select(`
          *,
          scenario_masters:scenario_master_id (title),
          stores:store_id (name),
          schedule_events:schedule_event_id (date, start_time, end_time)
        `, { count: 'exact' })

    // 組織フィルタ
    if (params.organizationId) {
      query = query.eq('organization_id', params.organizationId)
    }

    // フィルタ（サーバー側）
    if (params.statusFilter !== 'all') {
      query = query.eq('status', params.statusFilter)
    }
    if (params.paymentFilter !== 'all') {
      query = query.eq('payment_status', params.paymentFilter)
    }
    if (params.typeFilter !== 'all') {
      query = query.eq('reservation_source', params.typeFilter)
    }
    if (params.searchTerm) {
      // reservation_number / customer_name / title で部分一致
      query = query.or(
        `reservation_number.ilike.%${params.searchTerm}%,customer_name.ilike.%${params.searchTerm}%,title.ilike.%${params.searchTerm}%`
      )
    }

    return query
      // 新しい予約が上に来るように（UI側のDateパース失敗でも表示が崩れにくい）
      .order('created_at', { ascending: false })
      // priority がある場合は同日時内で優先（NULLは末尾）
      .order('priority', { ascending: false, nullsFirst: false })
      .range(params.from, params.to)
  },
  /** 予約の統計（件数は head カウントで取得。PostgREST の既定 max-rows による切り捨てを避ける） */
  async fetchStats(organizationId: string | null | undefined, monthStartISO: string, monthEndISO: string) {
    let totalQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
    let confirmedQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
      .in('status', ['confirmed', 'gm_confirmed'])
    let pendingQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'pending_gm', 'pending_store'])
    let cancelledQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled')
    let unpaidQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
      .eq('payment_status', 'unpaid').neq('status', 'cancelled')
    let monthlyTotalQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
      .gte('requested_datetime', monthStartISO).lte('requested_datetime', monthEndISO)

    // 売上合計（sum）は count では計算できないため、月次スコープに絞った実データ取得で集計する
    let monthlyRevenueRowsQuery = supabase
      .from('reservations')
      .select('status, total_price, final_price, requested_datetime')
      .gte('requested_datetime', monthStartISO).lte('requested_datetime', monthEndISO)

    if (organizationId) {
      totalQuery = totalQuery.eq('organization_id', organizationId)
      confirmedQuery = confirmedQuery.eq('organization_id', organizationId)
      pendingQuery = pendingQuery.eq('organization_id', organizationId)
      cancelledQuery = cancelledQuery.eq('organization_id', organizationId)
      unpaidQuery = unpaidQuery.eq('organization_id', organizationId)
      monthlyTotalQuery = monthlyTotalQuery.eq('organization_id', organizationId)
      monthlyRevenueRowsQuery = monthlyRevenueRowsQuery.eq('organization_id', organizationId)
    }

    return Promise.all([
      totalQuery,
      confirmedQuery,
      pendingQuery,
      cancelledQuery,
      unpaidQuery,
      monthlyTotalQuery,
      monthlyRevenueRowsQuery,
    ])
  },
}

