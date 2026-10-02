/**
 * 公演の保存・中止・削除（src/hooks/eventOperations）で使う読み取りと RPC のAPI
 *
 * フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 組織が分かれば organization_id でも絞る、という元の書き方（`if (organizationId) query = query.eq(...)`）をそのまま移した。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_WITH_CUSTOMER_SELECT_FIELDS } from '@/lib/reservationApi'
import type { RpcAdminUpdateReservationFieldsParams } from '@/lib/rpcTypes'

type OrgId = string | null | undefined

const ACTIVE_RESERVATION_SUMMARY_FIELDS =
  'id, customer_name, customer_email, reservation_number, participant_count, total_price, payment_method'

export const eventReservationReadApi = {
  /** 貸切の予約を顧客つきで1件（存在と組織境界の確認） */
  async findWithCustomerById(reservationId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
      .eq('id', reservationId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.single()
  },
  /** 公演の予約（キャンセル済み以外）を顧客つきで */
  async listUncancelledWithCustomerByEvent(scheduleEventId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
      .eq('schedule_event_id', scheduleEventId)
      // 確認ダイアログの件数（fetchActiveReservations = キャンセル済み以外）と
      // 揃える。従来の in('confirmed','pending') では gm_confirmed が漏れていた
      .neq('status', 'cancelled')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query
  },
  /** 予約 ID から、キャンセル済み以外の予約の概要を1件 */
  async findActiveSummaryById(reservationId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select(ACTIVE_RESERVATION_SUMMARY_FIELDS)
      .eq('id', reservationId)
      .neq('status', 'cancelled')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.maybeSingle()
  },
  /** 予約 ID から、紐づく公演 ID だけ */
  async findScheduleEventIdById(reservationId: string) {
    return supabase.from('reservations').select('schedule_event_id').eq('id', reservationId).maybeSingle()
  },
  /** 公演の予約（キャンセル済み以外）の概要 */
  async listActiveSummaryByEvent(scheduleEventId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select(ACTIVE_RESERVATION_SUMMARY_FIELDS)
      .eq('schedule_event_id', scheduleEventId)
      .neq('status', 'cancelled')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query
  },
  /** 予約 ID から、公演 ID とステータス */
  async findEventIdAndStatusById(reservationId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select('id, schedule_event_id, status')
      .eq('id', reservationId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.maybeSingle()
  },
  /** 公演の有効な予約の残存確認（id だけ） */
  async listUncancelledIdsByEvent(scheduleEventId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select('id')
      .eq('schedule_event_id', scheduleEventId)
      .neq('status', 'cancelled')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query
  },
  /** 貸切予約の保存前の店舗・表示名・公演の日時（履歴用） */
  async findPrivateBeforeUpdate(reservationId: string, organizationId: OrgId) {
    let query = supabase
      .from('reservations')
      .select(
        `
              store_id,
              display_customer_name,
              schedule_events!schedule_event_id (
                date,
                start_time,
                end_time,
                venue,
                scenario,
                store_id
              )
            `
      )
      .eq('id', reservationId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.maybeSingle()
  },
  /** 予約の項目を更新する（RPC admin_update_reservation_fields。DB 側で権限を確認する） */
  async adminUpdateFields(params: RpcAdminUpdateReservationFieldsParams) {
    return supabase.rpc('admin_update_reservation_fields', params)
  },
}

export const eventStoreReadApi = {
  /** 店舗の存在確認（id と名前） */
  async findIdAndName(storeId: string, organizationId: OrgId) {
    let query = supabase
      .from('stores')
      .select('id, name')
      .eq('id', storeId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.single()
  },
  /** 店舗の名前・略称・臨時会場の情報 */
  async findForTemporaryCheck(storeId: string, organizationId: OrgId) {
    let query = supabase
      .from('stores')
      .select('id, name, short_name, is_temporary, temporary_dates, temporary_venue_names')
      .eq('id', storeId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.single()
  },
  /** 臨時会場の追加済みの日付 */
  async findTemporaryDates(storeId: string, organizationId: OrgId) {
    let query = supabase
      .from('stores')
      .select('temporary_dates')
      .eq('id', storeId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.single()
  },
}

export const eventScheduleReadApi = {
  /** 元の公演の日付 */
  async findDateById(eventId: string, organizationId: OrgId) {
    let query = supabase
      .from('schedule_events')
      .select('date')
      .eq('id', eventId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.single()
  },
  /** 履歴用: 更新前の公演（スタッフ用ビュー） */
  async findStaffViewById(eventId: string, organizationId: OrgId) {
    let query = supabase
      .from('schedule_events_staff_view')
      .select('id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
      .eq('id', eventId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.single()
  },
}
