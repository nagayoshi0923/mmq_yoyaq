import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireStaff, type AuthUser } from './auth.js'

export async function representativeCompensation(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  res.setHeader('Cache-Control', 'no-store')
  const database = db as any
  const action = String(req.query.action ?? req.query.type ?? '')
  if (action === 'compensation-events') {
    const { data, error } = await database.from('schedule_events')
      .select('id,date,start_time,scenario,category')
      .eq('organization_id', user.orgId).eq('is_cancelled', true).eq('category', 'open')
      .order('date', { ascending: false }).limit(100)
    if (error) return res.status(500).json({ error: '公演を取得できませんでした' })
    return res.status(200).json(data ?? [])
  }
  if (action === 'preview-event-compensation') {
    const { data: event, error: eventError } = await database.from('schedule_events')
      .select('id,cancelled_at').eq('id', req.body?.event_id).eq('organization_id', user.orgId)
      .eq('is_cancelled', true).eq('category', 'open').maybeSingle()
    if (eventError || !event) return res.status(400).json({ error: '中止済みの通常公演を選択してください' })
    const reservations: any[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await database.from('reservations')
        .select('id,participant_count,status,cancelled_at,customer_name')
        .eq('organization_id', user.orgId).eq('schedule_event_id', event.id)
        .order('id').range(offset, offset + 499)
      if (error) return res.status(500).json({ error: '参加予定者を取得できませんでした' })
      reservations.push(...(data ?? []))
      if (!data || data.length < 500) break
    }
    const rows = []
    for (const r of reservations) {
      const row = { reservation_id: r.id, name: r.customer_name || '予約者', quantity: r.participant_count }
      if (r.cancelled_at && event.cancelled_at && +new Date(r.cancelled_at) < +new Date(event.cancelled_at)) {
        rows.push({ ...row, state: 'excluded', reason: '公演中止前にキャンセル済み' }); continue
      }
      if (!['confirmed', 'cancelled', 'checked_in'].includes(r.status)) {
        rows.push({ ...row, state: 'excluded', reason: '参加が確定していない予約' }); continue
      }
      const { data, error } = await database.rpc('grant_representative_compensation', {
        p_organization_id: user.orgId, p_reservation_id: r.id, p_actor: user.userId, p_apply: false, p_expected: null,
      })
      if (error) rows.push({ ...row, state: 'held', reason: error.code === 'P0001' ? error.message : '付与条件を確認できません' })
      else if (data.already_granted) rows.push({ ...row, state: 'granted', quantity: data.quantity })
      else rows.push({ ...row, state: 'ready', name: data.snapshot.customer_name, snapshot: data.snapshot })
    }
    return res.status(200).json(rows)
  }
  if (action === 'representative-candidates') {
    const { data, error } = await database.from('reservations')
      .select('id,title,participant_count,schedule_events:schedule_events!reservations_schedule_event_id_fkey!inner(date,is_cancelled,category)')
      .eq('organization_id', user.orgId).eq('schedule_events.is_cancelled', true)
      .eq('schedule_events.category', 'open').order('requested_datetime', { ascending: false }).limit(100)
    if (error) return res.status(500).json({ error: '予約を取得できませんでした' })
    return res.status(200).json(data ?? [])
  }
  const apply = action === 'grant-representative-compensation'
  if (apply && req.body?.gm_cancellation_confirmed !== true) {
    return res.status(400).json({ error: 'GM都合による公演中止であることを確認してください' })
  }
  const { data, error } = await database.rpc('grant_representative_compensation', {
    p_organization_id: user.orgId, p_reservation_id: req.body?.reservation_id,
    p_actor: user.userId, p_apply: apply, p_expected: apply ? req.body?.snapshot : null,
  })
  if (error) return res.status(400).json({ error: error.code === 'P0001' ? error.message : '付与対象を確認できませんでした' })
  if (apply && !data.already_granted) {
    // One notification for the committed batch. Replays never grant or notify again.
    const result = await database.functions.invoke('send-coupon-granted', { body: { customerCouponIds: data.coupon_ids } })
      .catch(() => ({ error: true }))
    data.notification_failed = !!result.error || result.data?.success !== true
  }
  return res.status(200).json(data)
}
