// api/sales.ts の 'handleStores' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import type { VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { STORE_SELECT_FIELDS_FOR_SALES } from '../sales/common.js'

// ─── 店舗一覧 (getStores 相当) ───────────────────────────────────────────────
export async function handleStores(res: VercelResponse, orgId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('stores')
    .select(STORE_SELECT_FIELDS_FOR_SALES)
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  if (error) {
    console.error('[sales] stores error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}
