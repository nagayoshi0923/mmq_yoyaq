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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ⚠️ P1-17: 通常の取得では機密トークンを含めない（XSS 時の漏洩防止）
const ORG_SETTINGS_SELECT_FIELDS =
  'id, organization_id, discord_webhook_url, discord_channel_id, discord_private_booking_channel_id, discord_shift_channel_id, discord_public_key, sender_email, sender_name, reply_to_email, google_sheets_id, notification_settings, time_slot_settings, custom_holidays, created_at, updated_at'

// 機密トークンを含む全フィールド（設定保存画面専用）
const ORG_SETTINGS_ALL_FIELDS =
  'id, organization_id, discord_bot_token, discord_webhook_url, discord_channel_id, discord_private_booking_channel_id, discord_shift_channel_id, discord_public_key, resend_api_key, sender_email, sender_name, reply_to_email, line_channel_access_token, line_channel_secret, google_sheets_id, google_service_account_key, notification_settings, time_slot_settings, custom_holidays, created_at, updated_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    const withSecrets = req.query.with_secrets === 'true'
    const fields = withSecrets ? ORG_SETTINGS_ALL_FIELDS : ORG_SETTINGS_SELECT_FIELDS

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('organization_settings')
      .select(fields)
      .eq('organization_id', user.orgId)
      .maybeSingle()

    if (error) {
      console.error('[org-settings] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }

    return res.status(200).json(data ?? null)
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[org-settings] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
