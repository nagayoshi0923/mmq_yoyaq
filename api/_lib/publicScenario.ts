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
  amount?: number | null
  status?: string
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

// participation_costs から公開価格を組み立てる。
// - time_slot='normal' の要素のみを使う。'gmtest' は絶対に含めない。
// - status が明示的に 'inactive' 等 'active' 以外の場合は除外（active/未指定は採用）。
// - 平日/土日祝で金額が異なる複数の normal 要素がある場合は
//   display を "平日4,500円 / 土日祝5,000円" 形式で組み立てる。
export function buildPrice(participationCosts: unknown, participationFee: number | null): PublicScenarioPrice {
  const entries: ParticipationCostEntry[] = Array.isArray(participationCosts)
    ? (participationCosts as ParticipationCostEntry[])
    : []

  const normals = entries.filter((e) => {
    if (!e || typeof e !== 'object') return false
    if (e.time_slot !== 'normal') return false
    if (e.status !== undefined && e.status !== null && e.status !== 'active') return false
    return typeof e.amount === 'number' && Number.isFinite(e.amount)
  })

  const amounts = normals
    .map((e) => e.amount as number)
    .filter((a) => Number.isFinite(a))

  // participation_costs に normal が無ければ旧カラム participation_fee にフォールバック
  if (amounts.length === 0) {
    const fee = typeof participationFee === 'number' && Number.isFinite(participationFee)
      ? participationFee
      : null
    return { normal: fee, display: fee != null ? yen(fee) : '' }
  }

  // 一意な金額を昇順で並べ、複数あれば平日/土日祝表記にする
  const unique = [...new Set(amounts)].sort((a, b) => a - b)
  if (unique.length === 1) {
    return { normal: unique[0], display: yen(unique[0]) }
  }
  // 複数金額（平日/土日祝など）: 安いほうを平日、高いほうを土日祝として表示
  const weekday = unique[0]
  const weekend = unique[unique.length - 1]
  return {
    normal: weekday,
    display: `平日${yen(weekday)} / 土日祝${yen(weekend)}`,
  }
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

// 成功レスポンス用のキャッシュヘッダ（CDNキャッシュ + stale-while-revalidate）
export function setPublicCache(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
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
