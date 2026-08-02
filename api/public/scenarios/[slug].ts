import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  serializePublicScenario,
  setPublicCors,
  setPublicCache,
  PUBLIC_SCENARIO_VIEW_COLUMNS,
  type PublicScenarioRow,
} from '../../_lib/publicScenario.js'

// YOYAQ-008: 公式サイト向け 公開シナリオ詳細 API。
// 仕様の正: docs/HP_PUBLIC_SCENARIO_API.md §3-2。
// 一覧と同じシリアライザで単体を返す。org クエリ必須。存在しない/非公開は404。

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const db = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function firstStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPublicCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!db) {
    console.error('[public/scenarios/:slug] env missing')
    return res.status(500).json({ error: 'サーバー設定エラー' })
  }

  const slug = firstStr(req.query.slug as string | string[] | undefined)?.trim()
  if (!slug) return res.status(400).json({ error: 'slug が必要です' })

  // org クエリ必須（テナント境界の明示）
  const orgSlug = firstStr(req.query.org as string | string[] | undefined)?.trim()
  if (!orgSlug) return res.status(400).json({ error: 'org クエリが必要です' })

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (orgError) {
    console.error('[public/scenarios/:slug] org lookup error:', orgError)
    return res.status(500).json({ error: 'データ取得に失敗しました' })
  }
  if (!org) return res.status(404).json({ error: '組織が見つかりません' })
  const orgId = (org as { id: string }).id

  const { data, error } = await db
    .from('public_scenarios')
    .select(PUBLIC_SCENARIO_VIEW_COLUMNS)
    .eq('organization_id', orgId)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[public/scenarios/:slug] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました' })
  }
  if (!data) return res.status(404).json({ error: 'シナリオが見つかりません' })

  const item = serializePublicScenario(data as unknown as PublicScenarioRow)

  setPublicCache(res)
  return res.status(200).json(item)
}
