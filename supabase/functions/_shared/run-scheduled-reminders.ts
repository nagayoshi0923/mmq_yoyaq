// @ts-nocheck
import { loadEffectiveEmailSettings } from './effective-email-settings.ts'
import { confirmedReservationPrice } from './confirmed-reservation-price.ts'
import { dueReminderSchedules } from './reminder-schedule.ts'
import { DEFAULT_REMINDER_ENABLED, DEFAULT_REMINDER_SCHEDULE } from './reminder-defaults.ts'

async function readPages(makeQuery) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}

function collectScheduleDays(rows) {
  const days = new Set()
  for (const row of rows) {
    const schedule = row.schedule ?? row.reminder_schedule ?? row.settings?.reminder_schedule
    if (!Array.isArray(schedule)) continue
    for (const item of schedule) {
      const daysBefore = Number(item?.days_before)
      if (item?.enabled && Number.isInteger(daysBefore) && daysBefore >= 0 && daysBefore <= 365) days.add(daysBefore)
    }
  }
  return days
}

function serviceRoleKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? Deno.env.get('SERVICE_ROLE_KEY')
    ?? Deno.env.get('SUPABASE_SECRET_KEY')
    ?? Deno.env.get('MMQ_SB_SECRET_KEY')
    ?? ''
}

async function sendReminderEmail(body) {
  const baseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  const serviceKey = serviceRoleKey()
  if (!baseUrl || !serviceKey) throw new Error('reminder sender is not configured')
  const response = await fetch(`${baseUrl}/functions/v1/send-reminder-emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    throw new Error(typeof data?.error === 'string' ? data.error : `reminder HTTP ${response.status}`)
  }
  return data
}

export async function runScheduledReminders(db, now = new Date(), send = sendReminderEmail) {
    const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    // 使われている日数の候補だけで公演を絞る。実効値と無効化は公演ごとに再確認する。
    const [overrides, legacy] = await Promise.all([
      readPages(() => db.from('operating_setting_overrides').select('id,settings').order('id')),
      readPages(() => db.from('email_settings').select('id,reminder_schedule').order('id')),
    ])
    const days = collectScheduleDays([...overrides, ...legacy])
    if (![...days].length) {
      for (const item of DEFAULT_REMINDER_SCHEDULE) if (item.enabled) days.add(item.days_before)
    }
    const dates = [...days].map(day => dateFormat.format(new Date(now.getTime() + day * 86400000)))
    if (!dates.length) return { success: true, sent: 0, skipped: 0, failures: 0 }
    const events = await readPages(() => db.from('schedule_events')
      .select('id,organization_id,store_id,date,start_time,end_time,scenario,venue,stores:store_id(name,address)')
      .in('date', dates).eq('is_cancelled', false).order('id'))
    let sent = 0
    let skipped = 0
    let failures = 0
    for (const event of events) {
      try {
        const settings = await loadEffectiveEmailSettings(db, { organizationId: event.organization_id, scheduleEventId: event.id })
        const reminderEnabled = settings?.reminder_enabled ?? DEFAULT_REMINDER_ENABLED
        const reminderSchedule = Array.isArray(settings?.reminder_schedule) && settings.reminder_schedule.length
          ? settings.reminder_schedule
          : DEFAULT_REMINDER_SCHEDULE
        if (!reminderEnabled) continue
        const due = dueReminderSchedules(event.date, event.start_time, reminderSchedule, now)
        if (!due.length) continue
        const reservations = await readPages(() => db.from('reservations')
          .select('id,organization_id,customer_email,customer_name,participant_count,total_price,final_price,discount_amount,reservation_number')
          .eq('organization_id', event.organization_id).eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending', 'gm_confirmed']).not('customer_email', 'is', null).order('id'))
        for (const schedule of due) for (const reservation of reservations) {
          const { data: claims, error: claimError } = await db.rpc('claim_scheduled_reminder', {
            p_organization_id: event.organization_id, p_reservation_id: reservation.id, p_event_id: event.id,
            p_event_date: event.date, p_days_before: schedule.days_before, p_send_time: schedule.time,
          })
          if (claimError) { failures++; continue }
          const claim = claims?.[0]
          if (!claim) { skipped++; continue }
          try {
            await send({
              reservationId: reservation.id, organizationId: event.organization_id, storeId: event.store_id,
              customerEmail: reservation.customer_email, customerName: reservation.customer_name,
              scenarioTitle: event.scenario, eventDate: event.date, startTime: event.start_time, endTime: event.end_time,
              storeName: event.stores?.name || event.venue, storeAddress: event.stores?.address,
              participantCount: reservation.participant_count, totalPrice: confirmedReservationPrice(reservation),
              reservationNumber: reservation.reservation_number, daysBefore: schedule.days_before, template: schedule.template,
              deliveryId: claim.delivery_id, deliveryLeaseToken: claim.lease_token,
            })
            const { error: finishError } = await db.from('scheduled_reminder_deliveries').update({ status: 'sent', sent_at: now.toISOString() })
              .eq('id', claim.delivery_id).eq('organization_id', event.organization_id).eq('lease_token', claim.lease_token)
            if (finishError) throw finishError
            sent++
          } catch (error) {
            // 同じdeliveryIdで再試行する。プロバイダ側でも同じキーを使い二重送信を防ぐ。
            await db.from('scheduled_reminder_deliveries').update({ status: 'failed' })
              .eq('id', claim.delivery_id).eq('organization_id', event.organization_id).eq('lease_token', claim.lease_token)
            failures++
            console.error('scheduled reminder failed', { deliveryId: claim.delivery_id, error: String(error instanceof Error ? error.message : error) })
          }
        }
      } catch (error) {
        failures++
        console.error('reminder event failed', { eventId: event.id, error: String(error instanceof Error ? error.message : error) })
      }
    }
    return { success: failures === 0, sent, skipped, failures }
}
