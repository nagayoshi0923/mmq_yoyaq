/** claim後〜送信直前に、中止・削除・予約取消を再確認する（読み取り専用）。 */
export const REMINDER_ELIGIBLE_STATUSES = ['confirmed', 'pending', 'gm_confirmed'] as const

export async function isScheduledReminderCurrent(db: any, params: {
  organizationId: string
  reservationId: string
  scheduleEventId: string
}): Promise<boolean> {
  const results = await Promise.all([
    db.from('reservations').select('status,schedule_event_id')
      .eq('id', params.reservationId).eq('organization_id', params.organizationId).maybeSingle(),
    db.from('schedule_events').select('is_cancelled')
      .eq('id', params.scheduleEventId).eq('organization_id', params.organizationId).maybeSingle(),
  ])
  for (const result of results) if (result.error) throw result.error
  const [reservation, event] = results.map(result => result.data)
  return !!reservation
    && !!event
    && event.is_cancelled === false
    && reservation.schedule_event_id === params.scheduleEventId
    && (REMINDER_ELIGIBLE_STATUSES as readonly string[]).includes(reservation.status)
}
