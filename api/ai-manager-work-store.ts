import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ApiError, requireAdmin, requireAuth } from './_lib/auth.js'
import { db, getMissingEnvError } from './_lib/db.js'

type WorkStore = {
  schema_version: 1
  mode: 'PRACTICE'
  revision: number
  items: unknown[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireAdmin(user)

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('ai_manager_work_stores')
        .select('schema_version, mode, revision, items')
        .eq('organization_id', user.orgId)
        .maybeSingle()
      if (error) throw new ApiError(500, `共有案件台帳の取得に失敗しました: ${error.message}`)
      return res.status(200).json({ store: data ? rowToStore(data) : emptyStore() })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message })
    console.error('[ai-manager-work-store] unexpected error:', error)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

function emptyStore(): WorkStore {
  return { schema_version: 1, mode: 'PRACTICE', revision: 0, items: [] }
}

function rowToStore(row: Record<string, unknown>): WorkStore {
  return {
    schema_version: 1,
    mode: 'PRACTICE',
    revision: Number(row.revision),
    items: Array.isArray(row.items) ? row.items : [],
  }
}
