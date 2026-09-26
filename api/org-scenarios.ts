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

const ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS =
  'id, organization_id, scenario_master_id, slug, org_status, pricing_patterns, gm_assignments, created_at, updated_at, title, author, author_id, key_visual_url, description, synopsis, caution, player_count_min, player_count_max, duration, genre, difficulty, participation_fee, extra_preparation_time, master_status'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const id = req.query.id as string | undefined
  const slug = req.query.slug as string | undefined
  const status = req.query.status as string | undefined

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    // 設定元は共通値を合成せず返す。組織はリクエスト値ではなく認証から確定する。
    if (req.query.type === 'settings-source') {
      const masterId = req.query.masterId
      if (typeof masterId !== 'string' || !masterId) {
        return res.status(400).json({ error: 'masterId が必要です' })
      }
      const { data, error } = await db
        .from('organization_scenarios')
        .select('id, duration, override_title, override_author, override_genre, override_difficulty, override_player_count_min, override_player_count_max, custom_key_visual_url, custom_description, custom_synopsis, custom_caution, custom_sensitive_tags, available_stores, survey_url, survey_enabled, survey_deadline_days, characters, private_booking_blocked_slots, booking_start_date, booking_end_date, scenario_kind, accepts_private_booking, available_from, available_until, is_license_buyout')
        .eq('organization_id', user.orgId)
        .eq('scenario_master_id', masterId)
        .maybeSingle()
      if (error) return res.status(500).json({ error: '作品の設定元を取得できませんでした' })
      return res.status(200).json(data ?? null)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (db as any)
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS)
      .eq('organization_id', user.orgId)

    if (id) {
      query = query.eq('id', id)
    }
    if (slug) {
      query = query.eq('slug', slug)
    }
    if (status) {
      query = query.eq('org_status', status)
    }

    query = query.order('title', { ascending: true })

    if (id || slug) {
      const { data, error } = await query.maybeSingle()
      if (error) {
        console.error('[org-scenarios] DB error:', error)
        return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
      }
      return res.status(200).json(data ?? null)
    }

    const { data, error } = await query
    if (error) {
      console.error('[org-scenarios] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[org-scenarios] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
