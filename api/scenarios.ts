import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireStaff, ApiError } from './_lib/auth'
import { db, getMissingEnvError } from './_lib/db'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const SELECT_FIELDS = [
  'id', 'org_scenario_id', 'organization_id', 'scenario_master_id', 'slug',
  'status', 'org_status', 'title', 'author', 'author_email', 'author_id',
  'report_display_name', 'key_visual_url', 'description', 'synopsis', 'caution',
  'player_count_min', 'player_count_max', 'male_count', 'female_count', 'other_count',
  'duration', 'weekend_duration', 'genre', 'difficulty', 'has_pre_reading',
  'release_date', 'official_site_url', 'required_props',
  'participation_fee', 'gm_test_participation_fee', 'participation_costs',
  'flexible_pricing', 'use_flexible_pricing',
  'license_amount', 'gm_test_license_amount',
  'franchise_license_amount', 'franchise_gm_test_license_amount',
  'external_license_amount', 'external_gm_test_license_amount',
  'fc_receive_license_amount', 'fc_receive_gm_test_license_amount',
  'fc_author_license_amount', 'fc_author_gm_test_license_amount',
  'gm_costs', 'gm_count', 'gm_assignments', 'available_gms', 'experienced_staff',
  'available_stores', 'production_cost', 'production_costs', 'depreciation_per_performance',
  'extra_preparation_time', 'play_count', 'notes', 'created_at', 'updated_at',
  'master_status', 'pricing_patterns', 'is_shared', 'scenario_type', 'rating',
  'kit_count', 'license_rewards', 'is_recommended',
  'survey_url', 'survey_enabled', 'survey_deadline_days',
  'characters', 'pre_reading_notice_message',
  'booking_start_date', 'booking_end_date',
  'individual_notice_template', 'character_assignment_method',
  'private_booking_time_slots', 'private_booking_blocked_slots',
].join(', ')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const envError = getMissingEnvError()
    if (envError || !db) {
      console.error('[GET /api/scenarios] 環境変数エラー:', envError)
      return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })
    }

    const user = await requireAuth(req)
    requireStaff(user)

    const { data, error } = await db
      .from('organization_scenarios_with_master')
      .select(SELECT_FIELDS)
      .eq('organization_id', user.orgId)  // org_id はサーバー側で強制フィルタ
      .order('title', { ascending: true })

    if (error) {
      console.error('[GET /api/scenarios] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました' })
    }

    return res.status(200).json(data ?? [])
  } catch (e) {
    if (e instanceof ApiError) {
      return res.status(e.status).json({ error: e.message })
    }
    console.error('[GET /api/scenarios] Unexpected error:', e)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
