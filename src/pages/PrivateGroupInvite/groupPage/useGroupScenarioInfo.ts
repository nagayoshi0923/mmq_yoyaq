/**
 * グループページ・招待ページで出す「作品について」の読み取り。
 * 作品ページ（ScenarioDetailPage）と同じ公開用の読み取り経路（/api/scenarios?id=…&org_id=…。
 * お客様・ゲスト・未ログインは公開用の列だけ）を使うので、作品ページに出ている以上のことは出ない。
 * キャラクターも作品ページと同じ organization_scenarios.characters（公開用の列に含まれる）。
 * 店舗の住所は公開用の stores_public から。
 */
import { useQuery } from '@tanstack/react-query'
import { scenarioApi, storeApi } from '@/lib/api'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { logger } from '@/utils/logger'
import type { ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import type { ScenarioCharacter } from '@/pages/ScenarioDetailPage/utils/types'

export interface GroupScenarioInfo {
  slug: string | null
  author: string | null
  genre: string[]
  difficulty: number | null
  duration: number | null
  weekendDuration: number | null
  playerMin: number | null
  playerMax: number | null
  hasPreReading: boolean
  synopsis: string | null
  caution: string | null
  sensitiveTags: string[]
  participationFee: number | null
  participationCosts: ParticipationCost[]
  characters: ScenarioCharacter[]
}

export interface GroupScenarioData {
  scenario: GroupScenarioInfo | null
  /** 組織の slug（作品ページ・注意事項の URL） */
  orgSlug: string | null
  stores: Array<{ id: string; name: string; short_name?: string | null; address?: string | null }>
}

type PublicScenarioRow = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** 公開用の行を画面で使う形にする（列が欠けていても落ちない） */
export function toGroupScenarioInfo(row: PublicScenarioRow): GroupScenarioInfo {
  const weekend = num(row.weekend_duration)
  return {
    slug: str(row.slug),
    author: str(row.author),
    genre: Array.isArray(row.genre) ? row.genre.filter((g): g is string => typeof g === 'string' && g.trim() !== '') : [],
    difficulty: num(row.difficulty),
    duration: num(row.duration),
    weekendDuration: weekend && weekend > 0 ? weekend : null,
    playerMin: num(row.player_count_min),
    playerMax: num(row.player_count_max),
    hasPreReading: row.has_pre_reading === true,
    synopsis: str(row.synopsis) ?? str(row.description),
    caution: str(row.caution),
    sensitiveTags: Array.isArray(row.sensitive_tags) ? row.sensitive_tags.filter((t): t is string => typeof t === 'string') : [],
    participationFee: num(row.participation_fee),
    participationCosts: Array.isArray(row.participation_costs) ? (row.participation_costs as ParticipationCost[]) : [],
    characters: Array.isArray(row.characters) ? (row.characters as ScenarioCharacter[]) : [],
  }
}

async function fetchGroupScenarioData(scenarioMasterId: string | null, organizationId: string): Promise<GroupScenarioData> {
  const [scenario, org, stores] = await Promise.all([
    scenarioMasterId
      ? scenarioApi.getById(scenarioMasterId, organizationId).catch(err => {
        // 受付を止めた作品などは公開用の読み取りで見つからない。グループの読み取り結果（作品名・画像）だけで出す
        logger.warn('[group-scenario-info] 作品の公開情報を読めませんでした', err)
        return null
      })
      : Promise.resolve(null),
    privateGroupPageReadApi.findOrganizationSlug(organizationId),
    storeApi.getAllPublic(organizationId).catch(err => {
      logger.warn('[group-scenario-info] 店舗の公開情報を読めませんでした', err)
      return []
    }),
  ])
  return {
    scenario: scenario ? toGroupScenarioInfo(scenario as unknown as PublicScenarioRow) : null,
    orgSlug: (org.data as { slug?: string | null } | null)?.slug ?? null,
    stores: stores.map(s => ({ id: s.id, name: s.name, short_name: s.short_name, address: s.address })),
  }
}

export function useGroupScenarioInfo(scenarioMasterId: string | null, organizationId: string | null | undefined) {
  return useQuery({
    queryKey: ['group-scenario-info', scenarioMasterId, organizationId],
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchGroupScenarioData(scenarioMasterId, organizationId as string),
  })
}
