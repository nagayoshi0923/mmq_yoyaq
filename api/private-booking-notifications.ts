import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)

    if (req.method === 'POST') {
      const action = (req.query.action as string | undefined) ?? 'resend-discord'
      if (action === 'resend-discord') return await handleResendDiscord(req, res, user)
      return res.status(400).json({ error: `unknown action: ${action}` })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[private-booking-notifications] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// Discord 通知再送信
// マルチテナント境界:
// - reservation の organization_id をサーバ側で取得し、ユーザの所属組織と一致を検証
// - 検証後、service_role 経由で Edge Function (notify-private-booking-discord) を invoke する
async function handleResendDiscord(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)

  const body = req.body as {
    id?: string
    scenario_master_id?: string
    scenario_title?: string
    customer_name?: string
    customer_email?: string
    customer_phone?: string
    participant_count?: number
    candidate_datetimes?: unknown
    notes?: string
    created_at?: string
  }

  const bookingId = body.id
  if (!bookingId) {
    return res.status(400).json({ error: 'id（予約ID）は必須です' })
  }

  // 予約の組織を検証（フロントから受け取った record はマルチテナント境界の根拠にしない）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reservation, error: lookupErr } = await (db as any)
    .from('reservations')
    .select('id, organization_id, scenario_master_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (lookupErr) {
    console.error('[pb-notifications:resend] lookup error:', lookupErr)
    return res.status(500).json({ error: '予約情報の取得に失敗しました' })
  }
  if (!reservation) {
    return res.status(404).json({ error: '予約が見つかりません' })
  }
  if (reservation.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の予約は操作できません' })
  }

  // Edge Function に転送（DB から取得した正規の organization_id / scenario_master_id を付与）
  // SUPABASE_URL は db.ts と同じ参照
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Edge Function 呼び出し用の環境変数が未設定です' })
  }

  const payload = {
    type: 'resend',
    table: 'reservations',
    record: {
      id: bookingId,
      organization_id: reservation.organization_id,
      scenario_id: reservation.scenario_master_id ?? body.scenario_master_id,
      scenario_title: body.scenario_title,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone,
      participant_count: body.participant_count,
      candidate_datetimes: body.candidate_datetimes,
      notes: body.notes,
      created_at: body.created_at,
    },
  }

  try {
    const fnRes = await fetch(`${supabaseUrl}/functions/v1/notify-private-booking-discord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // service_role JWT で Edge Function に対して system-call とみなされる
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!fnRes.ok) {
      const text = await fnRes.text().catch(() => '')
      console.error('[pb-notifications:resend] edge fn error:', fnRes.status, text)
      // detail には Edge Function の HTTP ステータス + 生レスポンスを含める
      // （クライアント側で console / toast に出して原因特定を容易にする）
      const truncatedText = (text || '').slice(0, 500)
      return res.status(502).json({
        success: false,
        error: 'Discord通知の再送信に失敗しました',
        detail: `Edge Function HTTP ${fnRes.status}${truncatedText ? `: ${truncatedText}` : ''}`,
      })
    }

    const result = await fnRes.json().catch(() => ({}))
    return res.status(200).json({ success: true, data: result })
  } catch (err) {
    console.error('[pb-notifications:resend] fetch error:', err)
    return res.status(500).json({
      success: false,
      error: 'Discord通知の再送信に失敗しました',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
