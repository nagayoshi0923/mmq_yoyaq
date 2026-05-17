import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'
import { z } from 'zod'
import { requireAuth, requireStaff, ApiError } from './_lib/auth'
import { db } from './_lib/db'

// Node.js ランタイムを明示（service_role key を安全に使うため Edge は使わない）
export const config = { runtime: 'nodejs' }

// 許可するオリジン（同一ドメイン本番 + ローカル開発）
const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

const app = new Hono().basePath('/api')

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
)

// ─── GET /api/scenarios ─────────────────────────────────────────────────────
// スタッフ・管理者向け: 自組織のシナリオ一覧（全フィールド）を返す。
// service_role で DB を叩くため RLS を完全にバイパスし、
// 代わりにこの関数内で organization_id を強制フィルタする。
const ScenariosQuerySchema = z.object({
  status: z.enum(['available', 'unavailable', 'coming_soon']).optional(),
})

app.get('/scenarios', async (c) => {
  try {
    const user = await requireAuth(c.req.raw)
    requireStaff(user)

    const parsed = ScenariosQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: 'パラメータが不正です', details: parsed.error.flatten() }, 400)
    }

    let query = db
      .from('organization_scenarios_with_master')
      .select(
        'id, org_scenario_id, organization_id, scenario_master_id, slug, status, org_status, ' +
        'title, author, author_email, author_id, report_display_name, key_visual_url, ' +
        'description, synopsis, caution, player_count_min, player_count_max, ' +
        'male_count, female_count, other_count, duration, weekend_duration, ' +
        'genre, difficulty, has_pre_reading, release_date, official_site_url, required_props, ' +
        'participation_fee, gm_test_participation_fee, participation_costs, ' +
        'flexible_pricing, use_flexible_pricing, ' +
        'license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, ' +
        'external_license_amount, external_gm_test_license_amount, ' +
        'fc_receive_license_amount, fc_receive_gm_test_license_amount, ' +
        'fc_author_license_amount, fc_author_gm_test_license_amount, ' +
        'gm_costs, gm_count, gm_assignments, available_gms, experienced_staff, ' +
        'available_stores, production_cost, production_costs, depreciation_per_performance, ' +
        'extra_preparation_time, play_count, notes, created_at, updated_at, ' +
        'master_status, pricing_patterns, is_shared, scenario_type, rating, kit_count, ' +
        'license_rewards, is_recommended, survey_url, survey_enabled, survey_deadline_days, ' +
        'characters, pre_reading_notice_message, booking_start_date, booking_end_date, ' +
        'individual_notice_template, character_assignment_method, ' +
        'private_booking_time_slots, private_booking_blocked_slots',
      )
      // org_id は auth.ts で DB から取得したもの。フロントからの入力を一切信用しない
      .eq('organization_id', user.orgId)
      .order('title', { ascending: true })

    if (parsed.data.status) {
      query = query.eq('org_status', parsed.data.status)
    }

    const { data, error } = await query
    if (error) {
      console.error('[GET /api/scenarios] DB error:', error)
      return c.json({ error: 'データ取得に失敗しました' }, 500)
    }

    return c.json(data ?? [])
  } catch (e) {
    if (e instanceof ApiError) return c.json({ error: e.message }, e.status)
    console.error('[GET /api/scenarios] Unexpected error:', e)
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

export default handle(app)
