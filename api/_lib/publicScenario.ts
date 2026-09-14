// YOYAQ-008: 公式サイト向け 公開シナリオAPI の共有シリアライザ。
// 仕様の正: docs/HP_PUBLIC_SCENARIO_API.md §3。
//
// public_scenarios ビューの1行を、公開JSONへ変換する唯一の関数。
// 一覧(/api/public/scenarios)と詳細(/api/public/scenarios/[slug])が両方これを使い、
// フィールドの食い違い（片方だけ列が漏れる/混入する）事故を防ぐ。
//
// ⚠️ ここで participation_costs のうち time_slot='gmtest'（スタッフ向け内部価格）は
//    絶対に露出させない。返すのは price.normal（数値）と price.display（表示用文字列）のみ。
//    flexible_pricing / pricing_patterns / use_flexible_pricing はビューに含めておらず、
//    ここでも生のまま返さない。

import { isParticipationCostActive } from '../../src/lib/pricing.js'

// public_scenarios ビューの行（ホワイトリスト列のみ）
export interface PublicScenarioRow {
  id: string
  organization_id: string
  slug: string | null
  title: string | null
  author: string | null
  key_visual_url: string | null
  description: string | null
  caution: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration: number | null
  weekend_duration: number | null
  genre: string[] | null
  sensitive_tags: string[] | null
  has_pre_reading: boolean | null
  scenario_type: string | null
  is_recommended: boolean | null
  release_date: string | null
  participation_fee: number | null
  participation_costs: unknown
  web_display_order: number | null
  updated_at: string | null
}

// participation_costs の1要素（正の型は src/lib/pricing.ts の ParticipationCost と同義。
// api/ は ESM 単独で動くため、公開に必要な最小フィールドだけをここで定義する）。
interface ParticipationCostEntry {
  time_slot?: string
  type?: string
  amount?: number | null
  status?: string
  startDate?: string
  endDate?: string
}

export interface PublicScenarioPrice {
  normal: number | null
  display: string
}

export interface PublicScenarioItem {
  id: string
  slug: string | null
  title: string | null
  author: string | null
  key_visual_url: string | null
  description: string | null
  caution: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration: number | null
  weekend_duration: number | null
  genre: string[]
  sensitive_tags: string[]
  has_pre_reading: boolean
  scenario_type: string
  is_recommended: boolean
  release_date: string | null
  price: PublicScenarioPrice
}

function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`
}

// 公開参加費の明示的な種別だけを使用する。金額の大小から曜日を推測しない。
// gmtest / カスタム項目や生の料金配列は公開しない。
export function buildPrice(participationCosts: unknown, participationFee: number | null): PublicScenarioPrice {
  const entries = (Array.isArray(participationCosts) ? participationCosts : []) as ParticipationCostEntry[]
  const amountFor = (slot: string): number | null => {
    const cost = entries.find(e => e && typeof e === 'object' && e.time_slot === slot
      && isParticipationCostActive(e)
      && typeof e.amount === 'number' && Number.isFinite(e.amount))
    if (!cost) return null
    if (cost.type === 'percentage') {
      return participationFee == null ? null : Math.round(participationFee * (1 + cost.amount! / 100))
    }
    return cost.amount!
  }
  const fallback = typeof participationFee === 'number' && Number.isFinite(participationFee) ? participationFee : null
  const normal = amountFor('normal') ?? amountFor('通常') ?? fallback
  const weekend = amountFor('weekend')
  // 予約画面と同じく weekend（土日祝）が holiday より優先される。
  const holiday = weekend ?? amountFor('holiday')
  if (normal == null) return { normal, display: '' }
  if (weekend != null && weekend !== normal) {
    return { normal, display: `平日${yen(normal)} / 土日祝${yen(weekend)}` }
  }
  if (weekend == null && holiday != null && holiday !== normal) {
    return { normal, display: `通常${yen(normal)} / 祝日${yen(holiday)}` }
  }
  return { normal, display: yen(normal) }
}

// public_scenarios ビューの1行を公開JSONへ変換する唯一の関数。
export function serializePublicScenario(row: PublicScenarioRow): PublicScenarioItem {
  return {
    id: row.id,
    slug: row.slug ?? null,
    title: row.title ?? null,
    author: row.author ?? null,
    key_visual_url: row.key_visual_url ?? null,
    description: row.description ?? null,
    caution: row.caution ?? null,
    player_count_min: row.player_count_min ?? null,
    player_count_max: row.player_count_max ?? null,
    duration: row.duration ?? null,
    weekend_duration: row.weekend_duration ?? null,
    genre: Array.isArray(row.genre) ? row.genre : [],
    sensitive_tags: Array.isArray(row.sensitive_tags) ? row.sensitive_tags : [],
    has_pre_reading: row.has_pre_reading ?? false,
    scenario_type: row.scenario_type ?? 'normal',
    is_recommended: row.is_recommended ?? false,
    release_date: row.release_date ?? null,
    price: buildPrice(row.participation_costs, row.participation_fee),
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── CORS（公開API・許可リスト方式）─────────────────────────────────────────────
// PUBLIC_SITE_ORIGINS（カンマ区切り）＋ 既定の公式HP/localhost。
// Access-Control-Allow-Credentials は付けない（公開APIで不要かつ危険）。
const DEFAULT_PUBLIC_ORIGINS = [
  'https://queenswaltz.jp',
  'https://www.queenswaltz.jp',
  'https://queenswaltz-hp.vercel.app',
]

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.PUBLIC_SITE_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_PUBLIC_ORIGINS, ...fromEnv])]
}

function isLocalhostOrigin(origin: string): boolean {
  return /^https?:\/\/localhost(:\d+)?$/.test(origin)
    || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
}

export function setPublicCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin as string | undefined
  const allowed = getAllowedOrigins()
  if (origin && (allowed.includes(origin) || isLocalhostOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  // Access-Control-Allow-Credentials は付けない（公開・非認証）
}

/** JST の次の日付境界まで何秒あるか（公開料金は日本日付で選ぶため）。 */
export function secondsUntilNextJstMidnight(now = new Date()): number {
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000
  const dayMs = 24 * 60 * 60 * 1000
  const msIntoJstDay = ((jstMs % dayMs) + dayMs) % dayMs
  return Math.max(1, Math.ceil((dayMs - msIntoJstDay) / 1000))
}

// 日付依存の公開料金が JST 日付境界をまたいで前日単価のまま残らないよう、
// s-maxage を「5分」と「次の JST 深夜まで」の短い方に抑え、長時間 SWR は使わない。
export function setPublicCache(res: VercelResponse, now = new Date()): void {
  const sMaxAge = Math.min(300, secondsUntilNextJstMidnight(now))
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxAge}`)
}

export const DEFAULT_ORG_SLUG = 'queens-waltz'

// SELECT に使うビューのホワイトリスト列（gmtest 価格・機密列は含まない）。
export const PUBLIC_SCENARIO_VIEW_COLUMNS = [
  'id',
  'organization_id',
  'slug',
  'title',
  'author',
  'key_visual_url',
  'description',
  'caution',
  'player_count_min',
  'player_count_max',
  'duration',
  'weekend_duration',
  'genre',
  'sensitive_tags',
  'has_pre_reading',
  'scenario_type',
  'is_recommended',
  'release_date',
  'participation_fee',
  'participation_costs',
  'web_display_order',
  'updated_at',
].join(', ')
