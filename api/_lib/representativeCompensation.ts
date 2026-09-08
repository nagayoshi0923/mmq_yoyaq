import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireStaff, type AuthUser } from './auth.js'

export async function representativeCompensation(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  res.setHeader('Cache-Control', 'no-store')
  const database = db as any
  const action = String(req.query.action ?? req.query.type ?? '')
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
