// api/schedule.ts の書き込みの共通部分（許可リスト、シナリオ名の自動紐付け、不明列の除去、書き込み後の取得）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { db } from '../db.js'

// ─── write 系ヘルパ ────────────────────────────────────────────────────

// DB で許可されているカテゴリ（チェック制約に合わせる）
export const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package', 'mtg']

// 作成可能フィールドのホワイトリスト（Mass Assignment 防止）
export const SCHEDULE_CREATABLE_FIELDS = [
  'date', 'store_id', 'venue', 'scenario', 'scenario_master_id', 'organization_scenario_id',
  'category', 'start_time', 'end_time', 'capacity', 'gms', 'gm_roles', 'notes',
  'time_slot', 'is_reservation_enabled', 'is_tentative', 'venue_rental_fee',
  'reservation_name', 'is_reservation_name_overwritten', 'is_private_request', 'reservation_id',
] as const

export const SCHEDULE_UPDATABLE_FIELDS = [
  ...SCHEDULE_CREATABLE_FIELDS,
  'is_cancelled', 'cancellation_reason', 'cancelled_at',
] as const

export function pickFields<T extends readonly string[]>(
  src: Record<string, unknown>,
  allowed: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(src)) {
    if ((allowed as readonly string[]).includes(key)) {
      out[key] = src[key]
    }
  }
  return out
}

export function normalizeScenarioName(name: string): string {
  return name
    .replace(/^["「『📗📕]/, '')
    .replace(/["」』]$/, '')
    .replace(/^貸・/, '')
    .replace(/^募・/, '')
    .replace(/^🈵・/, '')
    .replace(/^GMテスト・/, '')
    .replace(/^打診・/, '')
    .replace(/^仮/, '')
    .replace(/^（仮）/, '')
    .replace(/^\(仮\)/, '')
    .replace(/\(.*?\)$/, '')
    .replace(/（.*?）$/, '')
    .trim()
}

export function removeMissingScheduleColumn(
  payload: Record<string, unknown>,
  error: { message?: string; details?: string; hint?: string } | null,
): { nextPayload: Record<string, unknown>; removedColumn: string } | null {
  if (!error) return null
  const combined = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  const patterns = [
    /column "([^"]+)" of relation "schedule_events" does not exist/i,
    /Could not find the '([^']+)' column of 'schedule_events'/i,
  ]
  for (const pattern of patterns) {
    const match = combined.match(pattern)
    if (match?.[1]) {
      const missingColumn = match[1]
      if (missingColumn in payload) {
        const nextPayload = { ...payload }
        delete nextPayload[missingColumn]
        return { nextPayload, removedColumn: missingColumn }
      }
    }
  }
  return null
}

export async function findMatchingScenario(scenarioName: string | undefined): Promise<{ id: string; title: string } | null> {
  if (!scenarioName || scenarioName.trim() === '') return null
  if (!db) return null
  const cleanName = normalizeScenarioName(scenarioName)
  if (cleanName.length < 2) return null

  // エイリアスマッピングを取得
  const { data: aliasRows } = await db!
    .from('scenario_import_aliases')
    .select('alias, canonical_name')
  const aliasMap: Record<string, string> = {}
  for (const row of (aliasRows as Array<{ alias: string; canonical_name: string }> | null) ?? []) {
    aliasMap[row.alias] = row.canonical_name
  }

  let searchName = aliasMap[cleanName] ?? cleanName
  if (searchName === cleanName) {
    for (const [alias, formal] of Object.entries(aliasMap)) {
      if (cleanName.includes(alias)) {
        searchName = formal
        break
      }
    }
  }

  const { data: scenarios } = await db!
    .from('scenario_masters')
    .select('id, title')
  if (!scenarios || scenarios.length === 0) return null

  type ScenarioMasterRow = { id: string; title: string }
  const rows = scenarios as ScenarioMasterRow[]
  let match: ScenarioMasterRow | undefined = rows.find(s => s.title === searchName)
  if (!match) match = rows.find(s => s.title.startsWith(searchName))
  if (!match) match = rows.find(s => searchName.includes(s.title))
  if (!match && searchName.length >= 4) match = rows.find(s => s.title.includes(searchName))
  return match || null
}

// INSERT/UPDATE 後にスタッフ専用ビューから完全レコードを取得する
export const SCHEDULE_EVENT_FULL_SELECT = `
  *,
  stores:store_id (
    id,
    name,
    short_name
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    player_count_max
  )
`
