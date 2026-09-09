import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { createUserScopedClient, requireStaff, type AuthUser } from './auth.js'

export async function compensatedCancellation(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  res.setHeader('Cache-Control', 'no-store')
  const apply = req.query.action === 'confirm-compensated-cancellation'
  if (apply && req.body?.gm_cancellation_confirmed !== true) return res.status(400).json({ error: '補償対象の中止事由を確認してください' })
  const { data, error } = await (createUserScopedClient(user.jwt) as any).rpc('compensated_cancellation', {
    p_event_id: req.body?.event_id, p_apply: apply, p_expected: req.body?.snapshot ?? null,
    p_reason: req.body?.reason ?? null, p_bodies: req.body?.bodies ?? {},
  })
  if (error) return res.status(400).json({ error: error.code === 'P0001' ? error.message : '中止と補償の処理を完了できませんでした' })
  if (!apply) return res.status(200).json(data)
  // Only the persisted notice is sent. No separate coupon-granted notification.
  const database = db as any
  for (const id of data.reservation_ids ?? []) {
    const { data: notice, error: noticeError } = await database.from('compensated_cancellation_notices')
      .select('payload,status').eq('reservation_id', id).eq('organization_id', user.orgId).maybeSingle()
    if (noticeError || notice?.status !== 'pending') continue
    await database.functions.invoke('send-cancellation-confirmation', { body: notice.payload }).catch(() => undefined)
  }
  const { data: notices, error: statusError } = await database.from('compensated_cancellation_notices')
    .select('reservation_id,status').eq('event_id', req.body?.event_id).eq('organization_id', user.orgId)
  return res.status(200).json({ ...data, notices: notices ?? [], notification_pending: !!statusError || notices?.some((n: {status: string}) => n.status !== 'sent') })
}
