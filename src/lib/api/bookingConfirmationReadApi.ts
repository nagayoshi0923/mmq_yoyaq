/**
 * 予約確認（予約の申込）画面の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const bookingConfirmationReadApi = {
  /** 組織の公開カスタム休日（RPC） */
  async getPublicCustomHolidays(organizationId: string | undefined) {
    return supabase.rpc(
        'get_public_custom_holidays', { p_organization_id: organizationId }
      )
  },

  /** 同じ公演・同じ電話番号の有効な予約（1件） */
  async findDuplicateByPhone(eventId: string, customerPhone: string) {
    return supabase
      .from('reservations')
      .select('id, participant_count, customer_name, customer_phone, reservation_number')
      .eq('schedule_event_id', eventId)
      .eq('customer_phone', customerPhone)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])
      .limit(1)
  },

  /** 同じメールの、ほかの公演の有効な予約（時間の重なり確認用） */
  async listSameEmailOtherEventReservations(customerEmail: string, eventId: string) {
    return supabase
      .from('reservations')
      .select(`
        id, 
        participant_count, 
        customer_name, 
        reservation_number,
        schedule_event_id,
        title,
        schedule_events!schedule_event_id (
          date,
          start_time,
          end_time,
          scenario_masters:scenario_master_id (
            title,
            official_duration
          )
        )
      `)
      .eq('customer_email', customerEmail)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])
      .neq('schedule_event_id', eventId)
  },

  /** 公演（公開ビュー）の定員・締切・店舗 */
  async findPublicEventForBooking(eventId: string) {
    return supabase
      .from('schedule_events_public')
      .select('max_participants, capacity, current_participants, reservation_deadline_hours, store_id')
      .eq('id', eventId)
      .single()
  },

  /** 公演の予約受付期間（RPC） */
  async getPerformanceBookingWindow(eventId: string) {
    return supabase.rpc('get_performance_booking_window', { p_event_id: eventId })
  },

  /** 公演（公開ビュー）の組織 */
  async findEventOrganizationId(eventId: string) {
    return supabase
      .from('schedule_events_public')
      .select('organization_id')
      .eq('id', eventId)
      .single()
  },

  /** 本人の顧客行の電話番号（本人確認用） */
  async findOwnCustomerPhone(customerId: string, userId: string) {
    return supabase
      .from('customers')
      .select('phone')
      .eq('id', customerId)
      .eq('user_id', userId)
      .maybeSingle()
  },

  /** ログインユーザーの顧客情報（名前・ニックネーム・メール・電話） */
  async findCustomerProfileByUserId(userId: string) {
    return supabase
      .from('customers')
      .select('name, nickname, email, phone')
      .eq('user_id', userId)
      .maybeSingle()
  },

  /** メールで顧客情報（名前・ニックネーム・メール・電話） */
  async findCustomerProfileByEmail(email: string) {
    return supabase
      .from('customers')
      .select('name, nickname, email, phone')
      .eq('email', email)
      .maybeSingle()
  },

  /** 公開の支払い設定（RPC） */
  async getPublicPaymentSettings(organizationSlug: string, eventId: string) {
    return supabase.rpc('get_public_payment_settings', {
        p_organization_slug: organizationSlug, p_event_id: eventId,
      })
  },

  /** 公演（公開ビュー）の組織・店舗・会場 */
  async findPublicEventForConfirmation(eventId: string) {
    return supabase
      .from('schedule_events_public')
      .select('organization_id, store_id, venue')
      .eq('id', eventId)
      .single()
  },

  /** 本人の顧客行の電話番号（組織を指定して本人確認） */
  async findOwnCustomerPhoneInOrganization(customerId: string, userId: string, organizationId: string) {
    return supabase
      .from('customers')
      .select('phone')
      .eq('id', customerId)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle()
  },

  /** シナリオの料金設定（参加費・参加費の内訳）。組織が分かれば絞る */
  async findScenarioPricing(scenarioId: string, organizationId?: string) {
    // シナリオの料金設定を取得（organization_scenarios_with_master: 組織固有の participation_fee）
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('participation_fee, participation_costs')
      .eq('id', scenarioId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.maybeSingle()
  },
  /** 同じ公演の有効な予約を1件（メールが分かればメールで絞る。重複予約の確認用） */
  async listDuplicateByEmail(eventId: string, customerEmail?: string) {
    let query = supabase
      .from('reservations')
      .select('id, participant_count, customer_name, customer_email, reservation_number, schedule_event_id')
      .eq('schedule_event_id', eventId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])

    // メールアドレスでチェック
    if (customerEmail) {
      query = query.eq('customer_email', customerEmail)
    }

    return query.limit(1)
  },
}
