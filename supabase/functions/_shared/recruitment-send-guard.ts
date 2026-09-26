/** 読み取り専用。顧客の回答RPCを使わず、取得後に辞退・更新された案内を送信対象から外す。 */
export async function isRecruitmentExtensionCurrent(db: any, notice: {
  id: string; organization_id: string; schedule_event_id: string; reservation_id: string;
  cycle: number; attempts: number; lease_until: string;
}, now = Date.now()): Promise<boolean> {
  const results = await Promise.all([
    db.from('performance_recruitment_deadlines').select('status,cycle,deadline')
      .eq('schedule_event_id', notice.schedule_event_id).eq('organization_id', notice.organization_id).maybeSingle(),
    db.from('reservations').select('status,schedule_event_id').eq('id', notice.reservation_id)
      .eq('organization_id', notice.organization_id).maybeSingle(),
    db.from('schedule_events').select('is_cancelled').eq('id', notice.schedule_event_id)
      .eq('organization_id', notice.organization_id).maybeSingle(),
    db.from('performance_recruitment_notices').select('status,cycle,withdrawn_at,sent_at,attempts,lease_until')
      .eq('id', notice.id).eq('organization_id', notice.organization_id).maybeSingle(),
  ])
  for (const result of results) if (result.error) throw result.error
  const [decision, reservation, event, current] = results.map(result => result.data)
  return decision?.status === 'active' && decision.cycle === notice.cycle
    && Date.parse(decision.deadline) > now
    && event?.is_cancelled === false
    && reservation?.schedule_event_id === notice.schedule_event_id && ['pending', 'confirmed', 'gm_confirmed'].includes(reservation.status)
    && current?.status === 'sending' && current.cycle === notice.cycle
    && !current.withdrawn_at && !current.sent_at && current.attempts === notice.attempts
    && Date.parse(current.lease_until) === Date.parse(notice.lease_until)
    && Date.parse(current.lease_until) > now
}
