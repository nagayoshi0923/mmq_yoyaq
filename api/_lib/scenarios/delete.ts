// api/scenarios.ts の DELETE（削除）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './common.js'
import { ensureOwnedByOrg } from './update.js'

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function routeDelete(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  // マルチテナント境界: 自組織がこのシナリオを保有しているかチェック
  const owned = await ensureOwnedByOrg(db, orgId, id)
  if (!owned) {
    return res.status(404).json({ error: 'シナリオが見つかりません' })
  }

  const { data, error } = await db.rpc('delete_organization_scenario_atomic', {
    p_organization_id: orgId,
    p_scenario_master_id: id,
  })
  if (error || data?.success !== true) {
    console.error('[scenarios:delete] atomic delete failed:', error)
    return res.status(500).json({ error: '削除に失敗しました。シナリオと担当は変更していません。' })
  }

  return res.status(200).json({ success: true })
}
