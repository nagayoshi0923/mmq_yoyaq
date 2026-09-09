import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'

// 推測不能なメール専用トークンを所持する予約者だけが対象。ログ・URLへトークンを出さない。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' })
  }
  const { token, action, count, request_id, expected_count } = req.body || {}
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
    || !['view', 'withdraw'].includes(action)) {
    return res.status(400).json({ success: false, error: 'INVALID_LINK' })
  }
  if (action === 'withdraw' && (count !== undefined || request_id !== undefined) && (!Number.isInteger(count) || count < 1 || !Number.isInteger(expected_count) || expected_count < count || typeof request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id))) return res.status(400).json({ success: false, error: 'INVALID_COUNT' })
  if (!db) return res.status(503).json({ success: false, error: 'UNAVAILABLE' })
  try {
    const { data, error } = await db.rpc('respond_to_performance_recruitment_v2', {
      p_token: token, p_withdraw: action === 'withdraw', p_count: count ?? null, p_request_id: request_id ?? null, p_expected_count: expected_count ?? null,
    })
    if (error) return res.status(503).json({ success: false, error: 'UNAVAILABLE' })
    return res.status(data?.success ? 200 : data?.error === 'INVALID_LINK' ? 404 : 409).json(data)
  } catch {
    return res.status(503).json({ success: false, error: 'UNAVAILABLE' })
  }
}
