import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ⚠️ P1-17: 通常の取得では機密トークンを含めない（XSS 時の漏洩防止）
const ORG_SETTINGS_SELECT_FIELDS =
  'id, organization_id, discord_webhook_url, discord_channel_id, discord_private_booking_channel_id, discord_shift_channel_id, discord_public_key, sender_email, sender_name, reply_to_email, google_sheets_id, notification_settings, time_slot_settings, custom_holidays, created_at, updated_at'

// 機密トークンを含む全フィールド（設定保存画面専用）
const ORG_SETTINGS_ALL_FIELDS =
  'id, organization_id, discord_bot_token, discord_webhook_url, discord_channel_id, discord_private_booking_channel_id, discord_shift_channel_id, discord_public_key, resend_api_key, sender_email, sender_name, reply_to_email, line_channel_access_token, line_channel_secret, google_sheets_id, google_service_account_key, notification_settings, time_slot_settings, custom_holidays, created_at, updated_at'

// PATCH で更新可能な「非機密」フィールド（通常更新ルート）
const NON_SECRET_UPDATABLE_FIELDS = [
  'discord_webhook_url',
  'discord_channel_id',
  'discord_private_booking_channel_id',
  'discord_shift_channel_id',
  'discord_public_key',
  'sender_email',
  'sender_name',
  'reply_to_email',
  'google_sheets_id',
  'notification_settings',
  'time_slot_settings',
  'custom_holidays',
] as const

// 機密フィールド（with_secrets=true 時のみ更新可能）
const SECRET_UPDATABLE_FIELDS = [
  'discord_bot_token',
  'resend_api_key',
  'line_channel_access_token',
  'line_channel_secret',
  'google_service_account_key',
] as const

function pickFields<T extends readonly string[]>(
  source: Record<string, unknown>,
  allowed: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    if ((allowed as readonly string[]).includes(key)) {
      out[key] = source[key]
    }
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const method = req.method
  if (method !== 'GET' && method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (method === 'GET') return await routeGet(req, res, user.orgId)
    if (method === 'PATCH') return await routePatch(req, res, user.orgId)
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[org-settings] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────
async function routeGet(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const withSecrets = req.query.with_secrets === 'true'
  const fields = withSecrets ? ORG_SETTINGS_ALL_FIELDS : ORG_SETTINGS_SELECT_FIELDS

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_settings')
    .select(fields)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[org-settings] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json(data ?? null)
}

// ─── PATCH (upsert) ──────────────────────────────────────────────────────────
// /api/org-settings                   → 非機密フィールドのみ部分更新（upsert）
// /api/org-settings?with_secrets=true → 機密トークンも含めて更新可
//
// マルチテナント境界: organization_id は JWT 由来。クライアントが
// payload に含めてきても無視する。
async function routePatch(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const withSecrets = req.query.with_secrets === 'true'
  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // 機密フィールド以外のフィルタ
  const allowedFields = withSecrets
    ? ([...NON_SECRET_UPDATABLE_FIELDS, ...SECRET_UPDATABLE_FIELDS] as const)
    : NON_SECRET_UPDATABLE_FIELDS
  const safeUpdates = pickFields(updates, allowedFields as readonly string[])

  // with_secrets=false で機密フィールドが渡された場合は明示的にエラーで返す
  // （無音で落とすと「保存できたつもり」になり危ない）
  if (!withSecrets) {
    const submittedSecretKeys = Object.keys(updates).filter((k) =>
      (SECRET_UPDATABLE_FIELDS as readonly string[]).includes(k),
    )
    if (submittedSecretKeys.length > 0) {
      return res.status(400).json({
        error: '機密フィールドの更新には with_secrets=true が必要です',
        detail: `secret fields: ${submittedSecretKeys.join(', ')}`,
      })
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  // upsert: 1組織1行（organization_id に UNIQUE 制約あり）。
  // organization_id は JWT 由来で強制。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_settings')
    .upsert(
      {
        ...safeUpdates,
        organization_id: orgId,
      },
      { onConflict: 'organization_id' },
    )
    .select(withSecrets ? ORG_SETTINGS_ALL_FIELDS : ORG_SETTINGS_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[org-settings:update] DB error:', error)
    return res.status(500).json({ error: '設定の更新に失敗しました', detail: error.message })
  }

  return res.status(200).json(data)
}
