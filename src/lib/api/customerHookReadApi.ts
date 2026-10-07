/**
 * 顧客まわりのフック（お気に入り・通知・プレイ済み）の読み取りAPI
 *
 * フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const customerLookupReadApi = {
  async listIdsByUserId(userId: string) {
    return supabase.from('customers').select('id').eq('user_id', userId).order('organization_id', { nullsFirst: true }).order('created_at').order('id')
  },
  /** ログインユーザーの顧客行（id と user_id）を user_id で探す */
  async findByUserId(userId: string) {
    return supabase.from('customers').select('id, user_id').eq('user_id', userId).maybeSingle()
  },
  /** ログインユーザーの顧客行（id と user_id）をメールで探す */
  async findByEmail(email: string) {
    return supabase.from('customers').select('id, user_id').eq('email', email).maybeSingle()
  },
  /** user_id かメールのどちらかが一致する顧客の id */
  async findIdByUserIdOrEmail(userId: string, email: string) {
    return supabase.from('customers').select('id').or(`user_id.eq.${userId},email.eq.${email}`).maybeSingle()
  },
  /** メールが一致する顧客の id */
  async findIdByEmail(email: string) {
    return supabase.from('customers').select('id').eq('email', email).maybeSingle()
  },
  /** user_id が一致する顧客の id */
  async findIdByUserId(userId: string) {
    return supabase.from('customers').select('id').eq('user_id', userId).order('organization_id', { nullsFirst: true }).order('created_at').order('id').limit(1).maybeSingle()
  },
}

export const scenarioLikeReadApi = {
  /** 顧客のお気に入り（scenario_id と scenario_master_id） */
  async listByCustomer(customerId: string) {
    return supabase.from('scenario_likes').select('scenario_id, scenario_master_id').eq('customer_id', customerId)
  },
}

export const notificationReadApi = {
  /** 自分宛のお知らせ（新しい順に20件） */
  async listUserNotifications() {
    return supabase
      .from('user_notifications')
      .select('id, type, title, message, created_at, is_read, link, metadata')
      .order('created_at', { ascending: false })
      .limit(20)
  },
  /** 直近に確定した予約（since 以降に作成、最大5件） */
  async listRecentConfirmedReservations(customerId: string, sinceIso: string) {
    return supabase
      .from('reservations')
      .select('id, reservation_number, title, created_at, requested_datetime')
      .eq('customer_id', customerId)
      .gte('created_at', sinceIso)
      .in('status', ['confirmed', 'gm_confirmed'])
      .order('created_at', { ascending: false })
      .limit(5)
  },
  /** もうすぐ開催の予約（from〜to、最大3件） */
  async listUpcomingReservations(customerId: string, fromIso: string, toIso: string) {
    return supabase
      .from('reservations')
      .select('id, reservation_number, title, requested_datetime')
      .eq('customer_id', customerId)
      .gte('requested_datetime', fromIso)
      .lte('requested_datetime', toIso)
      .in('status', ['confirmed', 'gm_confirmed'])
      .order('requested_datetime', { ascending: true })
      .limit(3)
  },
  /** キャンセル待ちの空き通知（最大3件） */
  async listNotifiedWaitlist(customerId: string) {
    return supabase
      .from('waitlist')
      .select(`
          id, 
          created_at,
          schedule_events(id, date, start_time, scenario)
        `)
      .eq('customer_id', customerId)
      .eq('status', 'notified')
      .order('created_at', { ascending: false })
      .limit(3)
  },
  /** 最近キャンセルした予約（since 以降、最大5件） */
  async listRecentCancelledReservations(customerId: string, sinceIso: string) {
    return supabase
      .from('reservations')
      .select('id, reservation_number, title, cancelled_at, requested_datetime, cancellation_reason')
      .eq('customer_id', customerId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', sinceIso)
      .order('cancelled_at', { ascending: false })
      .limit(5)
  },
}
