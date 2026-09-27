import { db } from './db.js'
import type { AuthUser } from './auth.js'
import { canCustomerSelfCancel, resolveCancellationPolicy, type CalculableCancellationPolicy } from '../../src/lib/cancellationPolicy.js'

const CUSTOMER_CANCEL_BLOCKED_MESSAGE =
  'キャンセル料金が発生する期間のため、マイページからのキャンセルはできません。店舗へご連絡ください。'

type CancelScheduleEvent = {
  date?: string | null
  start_time?: string | null
  store_id?: string | null
  is_private_booking?: boolean | null
  category?: string | null
}

/** 顧客セルフキャンセルの受付期限を超えていないか検証。スタッフはスキップ。 */
export async function assertCustomerSelfCancelAllowed(
  user: AuthUser,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reservation: any,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (user.role !== 'customer') return { ok: true }

  const scheduleEventRaw = reservation.schedule_events
  const scheduleEvent = (Array.isArray(scheduleEventRaw) ? scheduleEventRaw[0] : scheduleEventRaw) as
    | CancelScheduleEvent
    | null
    | undefined

  if (!scheduleEvent?.date || !scheduleEvent?.start_time) {
    return { ok: false, status: 400, error: CUSTOMER_CANCEL_BLOCKED_MESSAGE }
  }

  const isPrivate = Boolean(
    reservation.private_group_id
      || scheduleEvent.is_private_booking
      || scheduleEvent.category === 'private',
  )

  const resolved = resolveCancellationPolicy(reservation)
  if (resolved.status !== 'ready') {
    return { ok: false, status: 400, error: CUSTOMER_CANCEL_BLOCKED_MESSAGE }
  }

  let policy: CalculableCancellationPolicy = resolved
  if (resolved.source === 'legacy_default') {
    // 保存済み規定は再計算しない。旧予約の期限だけ実効設定へ揃える。
    if (!db || !reservation.organization_id || !reservation.schedule_event_id) {
      return { ok: false, status: 503, error: 'キャンセル規定を確認できません。店舗へお問い合わせください。' }
    }
    try {
      const { data, error } = await db.rpc('resolve_operating_setting', {
        p_organization_id: reservation.organization_id,
        p_key: isPrivate ? 'private_cancellation_deadline_hours' : 'cancellation_deadline_hours',
        p_default: resolved.deadlineHours,
        p_event_id: reservation.schedule_event_id,
      })
      const hours = data && typeof data === 'object' && !Array.isArray(data) ? data.value : undefined
      if (error || typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
        return { ok: false, status: 503, error: 'キャンセル規定を確認できません。店舗へお問い合わせください。' }
      }
      policy = { ...resolved, deadlineHours: hours }
    } catch {
      return { ok: false, status: 503, error: 'キャンセル規定を確認できません。店舗へお問い合わせください。' }
    }
  }

  const participantTotal = reservation.final_price
    ?? reservation.total_price
    ?? ((reservation.unit_price || 0) * (reservation.participant_count || 0))

  try {
    const allowed = canCustomerSelfCancel({
      performanceDate: scheduleEvent.date,
      performanceStartTime: scheduleEvent.start_time,
      now: new Date(),
      policy,
      basisAmounts: {
        participant_total: Number(participantTotal) || 0,
        performance_total: Number(participantTotal) || 0,
      },
    })
    if (!allowed) {
      return { ok: false, status: 400, error: CUSTOMER_CANCEL_BLOCKED_MESSAGE }
    }
  } catch (error) {
    console.error('[reservations:cancel] customer self-cancel check failed:', error)
    return { ok: false, status: 400, error: CUSTOMER_CANCEL_BLOCKED_MESSAGE }
  }

  return { ok: true }
}

