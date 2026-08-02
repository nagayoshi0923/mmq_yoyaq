import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  serializePublicScenario,
  setPublicCors,
  setPublicCache,
  DEFAULT_ORG_SLUG,
  PUBLIC_SCENARIO_VIEW_COLUMNS,
  type PublicScenarioRow,
} from '../_lib/publicScenario.js'

// YOYAQ-008: 公式サイト向け 公開シナリオ一覧 API。
// 仕様の正: docs/HP_PUBLIC_SCENARIO_API.md §3-1。
// 認証なしの公開GET。public_scenarios ビューだけを読む（service_role）。

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const db = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 24

function firstStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPublicCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!db) {
    console.error('[public/scenarios] env missing')
    return res.status(500).json({ error: 'サーバー設定エラー' })
  }

  // ── org 解決（slug → organization_id。未知は404）──────────────────────────
  const orgSlug = (firstStr(req.query.org as string | string[] | undefined) ?? DEFAULT_ORG_SLUG).trim()
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (orgError) {
    console.error('[public/scenarios] org lookup error:', orgError)
    return res.status(500).json({ error: 'データ取得に失敗しました' })
  }
  if (!org) return res.status(404).json({ error: '組織が見つかりません' })
  const orgId = (org as { id: string }).id

  // ── クエリパラメータ ──────────────────────────────────────────────────────
  const tagRaw = firstStr(req.query.tag as string | string[] | undefined)
  const tags = tagRaw
    ? tagRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : []
  const playersRaw = firstStr(req.query.players as string | string[] | undefined)
  const players = playersRaw != null ? Number.parseInt(playersRaw, 10) : NaN
  const q = firstStr(req.query.q as string | string[] | undefined)?.trim()
  const sort = firstStr(req.query.sort as string | string[] | undefined) ?? 'recommended'

  const limitRaw = Number.parseInt(firstStr(req.query.limit as string | string[] | undefined) ?? '', 10)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, limitRaw))
    : DEFAULT_LIMIT
  const offsetRaw = Number.parseInt(firstStr(req.query.offset as string | string[] | undefined) ?? '', 10)
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

  // ── クエリ構築（public_scenarios ビュー・org_id 強制フィルタ）─────────────
  let query = db
    .from('public_scenarios')
    .select(PUBLIC_SCENARIO_VIEW_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)

  // tag: genre 配列との AND 一致
  if (tags.length > 0) {
    query = query.contains('genre', tags)
  }

  // players: player_count_min <= players <= player_count_max
  if (Number.isFinite(players)) {
    query = query.lte('player_count_min', players).gte('player_count_max', players)
  }

  // q: title / author の部分一致
  if (q) {
    const escaped = q.replace(/[%_,()]/g, (m) => `\\${m}`)
    query = query.or(`title.ilike.%${escaped}%,author.ilike.%${escaped}%`)
  }

  // sort
  switch (sort) {
    case 'newest':
      query = query
        .order('release_date', { ascending: false, nullsFirst: false })
        .order('title', { ascending: true })
      break
    case 'title':
      query = query.order('title', { ascending: true })
      break
    case 'duration':
      query = query
        .order('duration', { ascending: true, nullsFirst: false })
        .order('title', { ascending: true })
      break
    case 'recommended':
    default:
      query = query
        .order('is_recommended', { ascending: false })
        .order('web_display_order', { ascending: true, nullsFirst: false })
        .order('title', { ascending: true })
      break
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) {
    console.error('[public/scenarios] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました' })
  }

  const rows = (data ?? []) as unknown as PublicScenarioRow[]
  const items = rows.map(serializePublicScenario)

  setPublicCache(res)
  return res.status(200).json({
    items,
    total: count ?? 0,
    limit,
    offset,
  })
}
