// @ts-nocheck
import { loadEffectiveEmailSettings } from './effective-email-settings.ts'
import { dueReminderSchedules } from './reminder-schedule.ts'

async function readPages(makeQuery) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}

export async function runScheduledReminders(db, now = new Date()) {
    const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    // 使われている日数の候補だけで公演を絞る。実効値と無効化は公演ごとに再確認する。
    const [overrides, legacy] = await Promise.all([
      readPages(() => db.from('operating_setting_overrides').select('id,schedule:settings->reminder_schedule').order('id')),
      readPages(() => db.from('email_settings').select('id,reminder_schedule').order('id')),
    ])
    const days = new Set<number>()
    for (const row of [...overrides, ...legacy]) {
      const schedule = row.schedule ?? row.reminder_schedule
      if (!Array.isArray(schedule)) continue
      for (const item of schedule) if (item.enabled && Number.isInteger(item.days_before) && item.days_before >= 0 && item.days_before <= 365) days.add(item.days_before)
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
        if (!settings?.reminder_enabled || !Array.isArray(settings.reminder_schedule)) continue
        const due = dueReminderSchedules(event.date, event.start_time, settings.reminder_schedule, now)
        if (!due.length) continue
        const reservations = await readPages(() => db.from('reservations')
          .select('id,organization_id,customer_email,customer_name,participant_count,total_price,reservation_number')
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
            const { data, error } = await db.functions.invoke('send-reminder-emails', { body: {
              reservationId: reservation.id, organizationId: event.organization_id, storeId: event.store_id,
              customerEmail: reservation.customer_email, customerName: reservation.customer_name,
              scenarioTitle: event.scenario, eventDate: event.date, startTime: event.start_time, endTime: event.end_time,
              storeName: event.stores?.name || event.venue, storeAddress: event.stores?.address,
              participantCount: reservation.participant_count, totalPrice: reservation.total_price ?? 0,
              reservationNumber: reservation.reservation_number, daysBefore: schedule.days_before, template: schedule.template,
              deliveryId: claim.delivery_id, deliveryLeaseToken: claim.lease_token,
            } })
            if (error || !data?.success) throw error || new Error('reminder not sent')
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
