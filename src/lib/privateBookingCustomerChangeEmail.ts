import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export type ScheduleSnapshotForCustomerEmail = {
  date: string
  start_time: string
  end_time: string
  /** 店舗の表示名 */
  venueDisplay: string
  scenario?: string
  store_id?: string | null
}

export type BookingChangeRow = {
  field: string
  label: string
  oldValue: string
  newValue: string
}

/** YYYY-MM-DD をメール変更一覧用の日本語表記に */
export function formatScheduleDateForEmailLabel(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr || '—'
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10))
  const date = new Date(y, m - 1, d)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${y}年${m}月${d}日（${weekdays[date.getDay()]}）`
}

function normTime(t: string): string {
  return (t || '').slice(0, 5)
}

/**
 * スケジュール上の公演スナップショット差分から、予約変更メール用の changes を組み立てる
 */
export function diffScheduleSnapshotsForCustomerEmail(
  oldSnap: ScheduleSnapshotForCustomerEmail | null,
  newSnap: ScheduleSnapshotForCustomerEmail
): BookingChangeRow[] {
  const changes: BookingChangeRow[] = []
  if (!oldSnap) return changes

  if (oldSnap.date !== newSnap.date) {
    changes.push({
      field: 'date',
      label: '公演日',
      oldValue: formatScheduleDateForEmailLabel(oldSnap.date),
      newValue: formatScheduleDateForEmailLabel(newSnap.date),
    })
  }

  const oldRange = `${normTime(oldSnap.start_time)}〜${normTime(oldSnap.end_time)}`
  const newRange = `${normTime(newSnap.start_time)}〜${normTime(newSnap.end_time)}`
  if (oldRange !== newRange) {
    changes.push({ field: 'time', label: '開演時間', oldValue: oldRange, newValue: newRange })
  }

  if (oldSnap.venueDisplay !== newSnap.venueDisplay) {
    changes.push({
      field: 'venue',
      label: '店舗',
      oldValue: oldSnap.venueDisplay || '—',
      newValue: newSnap.venueDisplay || '—',
    })
  }

  const oldSc = (oldSnap.scenario || '').trim()
  const newSc = (newSnap.scenario || '').trim()
  if (oldSc !== newSc) {
    changes.push({
      field: 'scenario',
      label: 'シナリオ',
      oldValue: oldSc || '—',
      newValue: newSc || '—',
    })
  }

  return changes
}

/**
 * 貸切の予約者へ `send-booking-change-confirmation` を送る。
 * `reservations.customer_email` が無い場合はスキップ（Edge Function の検証と一致）。
 */
export async function sendPrivateBookingCustomerChangeEmail(params: {
  reservationId: string
  organizationId?: string | null
  changes: BookingChangeRow[]
  /** メール下部「変更後の予約内容」。未指定時は DB の schedule_events を参照 */
  currentSchedule?: ScheduleSnapshotForCustomerEmail | null
  scenarioTitleHint?: string
}): Promise<void> {
  const { reservationId, organizationId, changes, scenarioTitleHint, currentSchedule } = params
  if (changes.length === 0) return

  let resQuery = supabase
    .from('reservations')
    .select(
      `
      id,
      organization_id,
      reservation_number,
      title,
      participant_count,
      total_price,
      customer_email,
      customer_name,
      display_customer_name,
      customers ( id, name, email ),
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
    resQuery = resQuery.eq('organization_id', organizationId)
  }

  const { data: row, error } = await resQuery.maybeSingle()
  if (error || !row) {
    logger.error('貸切変更通知: 予約の取得に失敗', { reservationId, error })
    return
  }

  const email = row.customer_email?.trim()
  if (!email) {
    logger.warn('貸切変更通知: customer_email がないためスキップ', { reservationId })
    return
  }

  const rawCustomer = row.customers as { name?: string | null } | { name?: string | null }[] | null | undefined
  const cust = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer
  const customerName =
    (row.display_customer_name && row.display_customer_name.trim()) ||
    cust?.name?.trim() ||
    row.customer_name ||
    'お客様'

  const se = Array.isArray(row.schedule_events) ? row.schedule_events[0] : row.schedule_events

  const fromDb: ScheduleSnapshotForCustomerEmail | null = se
    ? {
        date: se.date,
        start_time: se.start_time,
        end_time: se.end_time,
        venueDisplay: se.venue || '—',
        scenario: se.scenario || undefined,
        store_id: se.store_id,
      }
    : null

  const current = currentSchedule ?? fromDb

  try {
    await supabase.functions.invoke('send-booking-change-confirmation', {
      body: {
        organizationId: organizationId || row.organization_id,
        storeId: current?.store_id ?? undefined,
        reservationId: row.id,
        customerEmail: email,
        customerName,
        scenarioTitle: scenarioTitleHint || row.title || se?.scenario || '',
        reservationNumber: row.reservation_number,
        changes,
        newEventDate: current?.date,
        newStartTime: current?.start_time,
        newEndTime: current?.end_time,
        newStoreName: current?.venueDisplay,
        newParticipantCount: row.participant_count ?? undefined,
        newTotalPrice: row.total_price ?? undefined,
      },
    })
    logger.log('貸切変更通知メール送信完了', { reservationId })
  } catch (e) {
    logger.error('貸切変更通知メール送信エラー', e)
  }
}
