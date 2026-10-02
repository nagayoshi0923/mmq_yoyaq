import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCors, authenticate } from './_lib/scenarios/common.js'
import { routeGet } from './_lib/scenarios/get.js'
import { routePost } from './_lib/scenarios/create.js'
import { routePatch } from './_lib/scenarios/update.js'
import { routeDelete } from './_lib/scenarios/delete.js'

// 作品 API の入口。メソッドごとの処理は api/_lib/scenarios/ に分けてある（整備 Phase 3、#774）。
// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。requireStaff(user) で既にスタッフ権限を
// 確認しているので、ビューの追加チェックは不要。

// ─── ハンドラ ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const method = req.method
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req, res)
  if (!auth) return // authenticate がレスポンスを返している

  const { orgId, isAnon } = auth

  try {
    if (method === 'GET') return await routeGet(req, res, orgId, isAnon)
    if (method === 'POST') return await routePost(req, res, orgId)
    if (method === 'PATCH') return await routePatch(req, res, orgId)
    if (method === 'DELETE') return await routeDelete(req, res, orgId)
  } catch (err) {
    console.error('[scenarios] unexpected error:', err)
    return res.status(500).json({
      error: 'サーバーエラーが発生しました',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
