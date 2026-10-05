/**
 * 貸切管理画面の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_SOURCE } from '@/lib/constants'
import type { RpcSendStaffGroupMessageParams } from '@/lib/rpcTypes'

export const privateBookingMgmtRpcApi = {
  /** 貸切却下の通知を再送する（RPC） */
  async retryRejectionDelivery(reservationId: string) {
    return supabase.rpc('retry_private_rejection_delivery', { p_reservation_id: reservationId })
  },

  /** 貸切却下の通知の送信状況（RPC。100件ずつ） */
  async getRejectionDeliveryStatus(reservationIds: string[]) {
    return supabase.rpc('get_private_rejection_delivery_status', { p_reservation_ids: reservationIds })
  },

  /** 貸切の送信履歴（RPC） */
  async getDeliveryHistory(reservationId: string) {
    return supabase.rpc('get_private_booking_delivery_history',{p_reservation_id:reservationId})
  },

  /** 承認の準備を再開する（RPC） */
  async resumeApprovalPreparation(deliveryId: string) {
    return supabase.rpc('resume_private_approval_preparation',{p_delivery_id:deliveryId})
  },

  /** 未送信の通知を再送する（RPC） */
  async retryUnsentDelivery(kind: string, deliveryId: string) {
    return supabase.rpc('retry_private_unsent_delivery',{p_kind:kind,p_delivery_id:deliveryId})
  },

  /** スタッフからグループへメッセージを送る（RPC） */
  async sendStaffGroupMessage(params: RpcSendStaffGroupMessageParams) {
    return supabase.rpc('send_staff_group_message', params)
  },

  /** 承認の送信状況（RPC。100件ずつ） */
  async getApprovalDeliveryStatus(reservationIds: string[]) {
    return supabase.rpc('get_private_booking_approval_delivery_status',{p_reservation_ids:reservationIds})
  },

  /** 貸切を承認して通知を作る（RPC） */
  async approveWithNotifications(params: Record<string, unknown>) {
    return supabase.rpc('approve_private_booking_with_notifications', params)
  },

  /** 貸切リクエストを削除する（RPC） */
  async deleteRequestAtomic(reservationId: string) {
    return supabase.rpc('delete_private_booking_request_atomic', {
        p_reservation_id: reservationId,
      })
  },
}

export const privateBookingMgmtReadApi = {
  /** 募集停止枠（組織・日付・店舗・時間帯） */
  async findBlockedSlot(organizationId: string, date: string, storeId: string, timeSlot: string) {
    return supabase
      .from('schedule_blocked_slots')
      .select('id')
      .filter('organization_id', 'eq', organizationId)
      .eq('date', date)
      .eq('store_id', storeId)
      .eq('time_slot', timeSlot)
      .maybeSingle()
  },

  /** 同じ日時・店舗の既存の公演（中止を除く） */
  async listExistingEvents(date: string, storeId: string) {
    return supabase
      .from('schedule_events_staff_view')
      .select('id, scenario, start_time, end_time, reservation_id')
      .eq('date', date)
      .eq('store_id', storeId)
      .neq('is_cancelled', true)
  },

  /** 貸切リクエストの店舗・組織・題名・顧客名 */
  async findRequestSummary(organizationId: string, requestId: string) {
    return supabase
      .from('reservations')
      .select('store_id, organization_id, title, customer_name')
      .eq('organization_id', organizationId)
      .eq('id', requestId)
      .maybeSingle()
  },

  /** ログインユーザーのスタッフ id */
  async findStaffIdByUserId(userId: string | undefined) {
    return supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .single()
  },

  /** スタッフの担当シナリオ */
  async listAssignedScenarioIds(staffId: string) {
    return supabase
      .from('staff_scenario_assignments')
      .select('scenario_master_id')
      .eq('staff_id', staffId)
  },

  /** 貸切リクエストのシナリオ情報（GM 人数・人数・所要時間・時間帯。範囲指定） */
  async listScenarioViewsForRequests(organizationId: string, masterIds: string[], from: number, to: number) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, gm_count, player_count_min, player_count_max, duration, weekend_duration, extra_preparation_time, private_booking_time_slots')
      .eq('organization_id', organizationId)
      .in('scenario_master_id', masterIds)
      .order('scenario_master_id')
      .range(from, to)
  },

  /** 重複確認用: 期間内の公演（500件ずつ） */
  async listEventsForConflicts(organizationId: string, dateFrom: string, dateTo: string, offset: number) {
    return supabase.from('schedule_events_staff_view')
      .select('id,date,start_time,end_time,store_id,reservation_id,scenario_master_id,scenario_id,organization_scenario_id,scenario,gms,category')
      .eq('organization_id', organizationId).eq('is_cancelled', false)
      .gte('date', dateFrom).lte('date', dateTo)
      .order('id').range(offset, offset + 499)
  },

  /** 重複確認用: 公演がまだ無い確定済みの貸切（500件ずつ） */
  async listConfirmedPrivateWithoutEvent(organizationId: string, offset: number) {
    return supabase.from('reservations')
      .select('id,store_id,gm_staff,scenario_master_id,candidate_datetimes')
      .eq('organization_id', organizationId).eq('status', 'confirmed').is('schedule_event_id', null)
      .order('id').range(offset, offset + 499)
  },

  /** 貸切の予約を id で（グループ・公演・ステータス） */
  async listPrivateReservationsByIds(organizationId: string, ids: string[]) {
    return supabase
      .from('reservations')
      .select('id, private_group_id, schedule_event_id, status')
      .eq('organization_id', organizationId)
      .in('id', ids)
      .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
  },

  /** グループに紐づく予約（予約番号つき。範囲指定） */
  async listReservationsByGroupIds(organizationId: string, groupIds: string[], from: number, to: number) {
    return supabase.from('reservations').select('id, private_group_id, reservation_number')
      .eq('organization_id', organizationId).in('private_group_id', groupIds)
      .order('id').range(from, to)
  },

  /** 公演を id で（日時・店舗・中止・GM） */
  async listEventsByIds(organizationId: string, ids: string[]) {
    return supabase.from('schedule_events').select('id, date, start_time, end_time, store_id, is_cancelled, gms')
      .eq('organization_id', organizationId).in('id', ids)
  },

  /** 店舗を id で（名前・略称） */
  async listStoresByIds(organizationId: string, ids: string[]) {
    return supabase.from('stores').select('id, name, short_name').eq('organization_id', organizationId).in('id', ids)
  },

  /** 指定日の募集停止枠 */
  async listBlockedSlotsOnDates(organizationId: string, dates: string[]) {
    return supabase
      .from('schedule_blocked_slots')
      .select('date, store_id, time_slot, created_at')
      .filter('organization_id', 'eq', organizationId)
      .in('date', dates)
  },

  /** シナリオの対応店舗（組織のシナリオ表示ビュー） */
  async findScenarioStoresView(scenarioMasterId: string, organizationId: string | null) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('available_stores, scenario_master_id')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle()
  },

  /** シナリオを担当できる GM（メイン・サブ）のスタッフ id */
  async listGmAssignmentsByScenario(scenarioMasterId: string) {
    return supabase
      .from('staff_scenario_assignments')
      .select('staff_id')
      .eq('scenario_master_id', scenarioMasterId)
      .or('can_main_gm.eq.true,can_sub_gm.eq.true')
  },

  /** 予約の店舗と組織 */
  async findReservationStoreAndOrganization(reservationId: string) {
    return supabase
      .from('reservations')
      .select('store_id, organization_id')
      .eq('id', reservationId)
      .maybeSingle()
  },

  /** GM 準備確認用: 予約の組織・シナリオ・候補日時 */
  async findReservationForReadiness(reservationId: string) {
    return supabase
      .from('reservations')
      .select('id, organization_id, scenario_master_id, candidate_datetimes')
      .eq('id', reservationId)
      .maybeSingle()
  },

  /** GM 準備確認用: シナリオの必要 GM 人数 */
  async findScenarioGmCount(scenarioMasterId: string, organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('gm_count')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', organizationId)
      .maybeSingle()
  },

  /** GM 準備確認用: 稼働中のスタッフ（id で） */
  async listActiveStaffByIds(organizationId: string, ids: string[]) {
    return supabase
      .from('staff').select('id').eq('organization_id', organizationId).eq('status', 'active').in('id', ids)
  },

  /** GM 準備確認用: スタッフのシナリオ担当（メイン・サブ可否） */
  /**
   * 作品ごとの担当GMのメイン・サブ設定（GM回答の表示用、#827）。自組織への絞り込みは RLS（閲覧の決まり）で行い、
   * 念のため organization_id も返して呼び出し側で自組織以外を捨てる（#856）。
   * 同じスタッフに複数作品の行があるため、並び順は staff_id と scenario_master_id の組で固定する（ページの取りこぼし防止）。
   */
  async listGmAssignmentsByScenarios(scenarioMasterIds: string[], from: number, to: number) {
    return supabase
      .from('staff_scenario_assignments').select('organization_id, staff_id, scenario_master_id, can_main_gm, can_sub_gm')
      .in('scenario_master_id', scenarioMasterIds)
      .order('staff_id').order('scenario_master_id').range(from, to)
  },
  async listGmAssignmentsByStaffIds(scenarioMasterId: string, organizationId: string, staffIds: string[]) {
    return supabase
      .from('staff_scenario_assignments').select('staff_id, can_main_gm, can_sub_gm')
      .eq('scenario_master_id', scenarioMasterId).eq('organization_id', organizationId).in('staff_id', staffIds)
  },
}

export const privateBookingRequestReadApi = {
  /**
   * 貸切リクエストの一覧の1ページ（組織・担当シナリオ・ステータスで絞り、新しい順。範囲指定）
   * 一覧で使う列だけを読む（全列だと本番約 1,100 件で約 3.6MB → 約 1.6MB。#835）。列を使い足すときはここにも足す。
   */
  async listRequestsPage(organizationId: string, allowedScenarioIds: string[] | null, statuses: string[], from: number, to: number) {
    let query = supabase
      .from('reservations')
      .select(`
        id, reservation_number, scenario_master_id, private_group_id, status, title, candidate_datetimes,
        customer_email, customer_phone, customer_notes, participant_count,
        confirmed_at, cancelled_at, created_at, updated_at,
        scenario_masters:scenario_master_id(title, official_duration),
        customers:customer_id(name, phone),
        confirmer:staff!reservations_confirmed_by_fkey(name),
        canceller:staff!reservations_cancelled_by_fkey(name)
      `)
      .eq('organization_id', organizationId)
      .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (allowedScenarioIds !== null) {
      query = query.in('scenario_master_id', allowedScenarioIds)
    }
    query = query.in('status', statuses)

    return query.range(from, to)
  },
}

