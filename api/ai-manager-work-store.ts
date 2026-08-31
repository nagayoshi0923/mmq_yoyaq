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

    if (req.method === 'PATCH') {
      const expectedRevision = Number(req.body?.expected_revision)
      const store = req.body?.store as WorkStore | undefined
      const error = validateStore(store, expectedRevision)
      if (error) return res.status(400).json({ error })

      const { data, error: rpcError } = await db.rpc('replace_ai_manager_work_store', {
        p_organization_id: user.orgId,
        p_expected_revision: expectedRevision,
        p_store: store,
        p_updated_by: user.userId,
      })
      if (rpcError) throw new ApiError(500, `共有案件台帳の保存に失敗しました: ${rpcError.message}`)
      const result = Array.isArray(data) ? data[0] : data
      if (result?.result_status === 'REVISION_CONFLICT') {
        return res.status(409).json({ code: 'REVISION_CONFLICT', current_revision: result.current_revision })
      }
      if (result?.result_status !== 'UPDATED') {
        throw new ApiError(500, '共有案件台帳の保存結果を確認できません')
      }
      return res.status(200).json({ store })
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

function validateStore(store: WorkStore | undefined, expectedRevision: number): string | null {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return 'expected_revisionが不正です'
  if (!store || typeof store !== 'object' || Array.isArray(store)) return 'storeが必要です'
  if (store.schema_version !== 1 || store.mode !== 'PRACTICE') return 'storeのschema_versionまたはmodeが不正です'
  if (!Number.isInteger(store.revision) || store.revision !== expectedRevision + 1) return 'store.revisionが不正です'
  if (!Array.isArray(store.items)) return 'store.itemsは配列が必要です'
  if (store.items.some((item) => !validItem(item))) return 'store.itemsに不正な案件があります'
  return null
}

function validItem(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !item.id) return false
  if (typeof item.title !== 'string' || !item.title) return false
  if (item.external_action_allowed !== false) return false
  return Array.isArray(item.history) && item.history.length > 0
}
