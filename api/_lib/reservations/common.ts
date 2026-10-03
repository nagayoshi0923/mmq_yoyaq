// api/reservations.ts の共通部分（CORS、SELECT 文字列、状態の定数、組織の所有確認、取消料の記録、予約番号の生成）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { recordCancellationIntake } from '../cancellation-payments/intake.js'
import type { BillingReservation } from '../../../src/lib/cancellationBilling.js'

export function groupCancellationError(error: { code?: string; message?: string } | null) {
  if (error?.code === 'P0052') return { status: 400, message: 'キャンセル期限を過ぎているか、料金が発生するため、店舗へご連絡ください。' }
  if (error?.code === 'P0053') return { status: 409, message: '予約時のキャンセル規定を確認できません。店舗へお問い合わせください。' }
  if (error?.code === 'P0050' || error?.code === 'P0051') {
    return { status: 409, message: '予約と貸切グループの紐づきが一致しません。取消は保存されていません。店舗管理者に確認してください。' }
  }
  if (error?.code === '55P03') {
    return { status: 409, message: 'ほかの操作が進行中です。画面を更新してから、もう一度取消をお試しください。' }
  }
  return { status: 500, message: '予約と貸切グループのキャンセルに失敗しました。' }
}

// ─── CORS ────────────────────────────────────────────────────────────────────
export const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── 共通 SELECT 文字列 ──────────────────────────────────────────────────────
export const RESERVATION_SELECT_FIELDS =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, scenario_master_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, cancellation_policy_snapshot_version, cancellation_policy_store_id, cancellation_policy_performance_type, cancellation_policy_deadline_hours, cancellation_policy_fees, cancellation_policy_fee_basis, cancellation_policy_updated_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, private_group_id, candidate_datetimes, arrived_late'

export const CUSTOMER_SELECT_FIELDS =
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, avatar_url, preferences, notification_settings, created_at, updated_at'

export const RESERVATION_WITH_CUSTOMER_SELECT_FIELDS = `${RESERVATION_SELECT_FIELDS}, customers(${CUSTOMER_SELECT_FIELDS})`

export const SCHEDULE_EVENT_EMBED_FOR_CANCEL =
  'schedule_events!schedule_event_id(id, date, start_time, end_time, venue, scenario, organization_id, is_private_booking, is_cancelled, gms, store_id, category)'

export const RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS = `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_CANCEL}`

export const SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL =
  'schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario, store_id)'

export const RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS = `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL}`

export const RESERVATION_SUMMARY_SELECT_FIELDS =
  'schedule_event_id, date, venue, scenario, start_time, end_time, max_participants, current_reservations, available_seats, reservation_count'

// reservation_source の有効値（クライアントから来た値を検証する用）
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'] as const

export const RESERVATION_SOURCE_STAFF_ENTRY = 'staff_entry'

// 自組織が所有する予約か確認するヘルパ。
// platform customer (role='customer' かつ orgId='') の場合は API 層で org 不一致を
// 許容し、後段の RPC (cancel_reservation_with_lock 等) 内部の auth.uid() ベースの
// ownership チェックに委ねる（顧客の users.organization_id は NULL なので
// 厳密な org 一致を要求すると常に 403 になる）。
export type OwnedReservationRef = { id: string; organization_id: string; customer_id: string | null; private_group_id: string | null; schedule_event_id: string | null }

export async function ensureReservationOwnedByOrg(
  reservationId: string,
  user: AuthUser,
): Promise<{ ok: true; reservation: OwnedReservationRef } | { ok: false; status: number; error: string }> {
  if (!db) return { ok: false, status: 500, error: 'db unavailable' }
  const { data, error } = await db
    .from('reservations')
    .select('id, organization_id, customer_id, private_group_id, schedule_event_id')
    .eq('id', reservationId)
    .maybeSingle()
  if (error) {
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    return { ok: false, status: 404, error: '予約が見つかりません' }
  }
  if (data.organization_id !== user.orgId) {
    // platform customer は org 不一致でも許容（RPC 側で auth.uid() ownership 検証）
    const isPlatformCustomer = user.role === 'customer' && !user.orgId
    if (!isPlatformCustomer) {
      return { ok: false, status: 403, error: '他組織の予約は操作できません' }
    }
  }
  return { ok: true, reservation: data }
}

// Billing failure is reported separately: seat release must not be rolled back or repeated.
/** 取消の料金台帳に渡す予約。公演の結合は1件だが、型推論・旧データで配列のこともある */
export type CancellationBillingReservation = BillingReservation & {
  id: string; organization_id: string; status?: string | null; payment_method?: string | null
  schedule_events?: CancellationBillingEvent | CancellationBillingEvent[] | null
}
type CancellationBillingEvent = { date?: string | null; start_time?: string | null; is_cancelled?: boolean | null }

export async function recordBillingForCancellation(user: AuthUser, reservation: CancellationBillingReservation, requestReceivedAt: string, organizerRejected = false): Promise<boolean> {
  if (!db || reservation.payment_method === 'staff') return false
  try {
    const event = Array.isArray(reservation.schedule_events) ? reservation.schedule_events[0] : reservation.schedule_events
    await recordCancellationIntake(db, {
      organizationId: reservation.organization_id, reservationId: reservation.id, reservation,
      eventDate: event?.date ?? '', startTime: event?.start_time ?? '',
      receivedAt: user.role === 'customer' ? requestReceivedAt : null,
      processedAt: new Date().toISOString(), actorId: user.userId,
      previouslyCancelled: reservation.status === 'cancelled', organizerCancelled: organizerRejected || event?.is_cancelled === true,
    })
    return false
  } catch {
    console.warn('[reservations:cancel] fee intake requires operator review', { reservationId: reservation.id })
    return true
  }
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────
export function generateReservationNumber(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${dateStr}-${randomStr}`
}
