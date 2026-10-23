/**
 * MMQ 全体トップのデータ（全組織の公開情報だけ）。
 * 公演は schedule_events_public、店舗は stores_public、作品は organization_scenarios_with_master と
 * 公開キー（get_public_available_scenario_keys）、組織は稼働中の組織の名前・slug・ロゴだけを読む。
 */
import { publicBookingListReadApi, publicBookingReadApi } from '@/lib/api/publicBookingReadApi'
import { platformPageReadApi } from '@/lib/api/platformPageReadApi'
import { storeHasRecruitmentPause, type StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
import { isPublicRegularStore, storeDisplayName, storePrefecture } from '@/lib/publicStoreName'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { addJstDays } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import { buildPublicPerformance, isPublicOpenEvent, type PerformanceScenarioRow } from '@/pages/PublicBookingTop/utils/performanceRows'

/** 全体トップで読む期間（今日から 8 週間） */
export const PLATFORM_RANGE_DAYS = 55

export interface PlatformOrganization {
  id: string
  slug: string
  name: string
  logo_url: string | null
  store_names: string[]
  /** 公開中の店舗（臨時会場・オフィスを除く。name はお客様向けの名前）。貸切を始めるページの「希望店舗」に使う */
  stores: PlatformOrganizationStore[]
  store_count: number
  prefectures: string[]
  scenario_count: number
}

export interface PlatformOrganizationStore {
  id: string
  name: string
}

/** 全国の公開作品（作品マスタ単位。複数の組織で公開していても 1 件） */
export interface PlatformScenario {
  id: string
  slug: string
  title: string
  author: string
  key_visual_url: string | null
  genres: string[]
  player_count_min: number
  player_count_max: number
  release_date: string | null
  /** いずれかの組織が最初に公開一覧に加えた日時（organization_scenarios.created_at の最小。新作一覧の公開日に使う） */
  listed_at: string | null
  /** この作品を公開している組織と、その組織での公演期間の終わり（貸切受付中の判定に使う） */
  organizations: Array<{ organization_id: string; available_from: string | null; available_until: string | null }>
  is_recommended: boolean
}

export interface PlatformTopData {
  organizations: PlatformOrganization[]
  scenarios: PlatformScenario[]
  performances: PublicPerformance[]
  /** 店舗がある都道府県（店舗の住所から。並びは店舗数の多い順） */
  prefectures: string[]
  /** 稼働中の組織の公開店舗（臨時会場を含む。貸切受付中の判定で上演できる店舗を出すのに使う） */
  stores: Array<{ id: string; organization_id: string; status: string | null; is_temporary: boolean | null }>
}

export async function fetchPlatformTopData(today: string): Promise<PlatformTopData> {
  const end = addJstDays(today, PLATFORM_RANGE_DAYS)
  const [orgResult, storeResult, scenarioResult, keyResult, eventResult] = await Promise.all([
    platformPageReadApi.listActiveOrganizations(),
    publicBookingListReadApi.listPublicStores(null),
    publicBookingListReadApi.listAvailableScenarios(null),
    platformPageReadApi.getPublicAvailableScenarioKeys(),
    publicBookingListReadApi.listAllPublicEventsInRange(today, end),
  ])
  if (orgResult.error) logger.error('全体トップ: 組織の取得に失敗', orgResult.error)
  if (storeResult.error) logger.error('全体トップ: 店舗の取得に失敗', storeResult.error)
  if (scenarioResult.error) logger.error('全体トップ: 作品の取得に失敗', scenarioResult.error)
  if (eventResult.error) logger.error('全体トップ: 公演の取得に失敗', eventResult.error)
  if (orgResult.error && eventResult.error) throw orgResult.error

  const orgs = orgResult.data ?? []
  const orgById = new Map(orgs.map((o) => [o.id, o]))
  const stores = (storeResult.data ?? []).filter((s) => s.organization_id && orgById.has(s.organization_id))
  const storeById = new Map(stores.map((s) => [s.id, s]))

  // 公開中の作品（店舗トップと同じ: 公開キーがあればそれに含まれるものだけ）
  const keys = keyResult.data ?? []
  const keySet = new Set(keys.map((k: { organization_id: string; scenario_master_id: string }) => `${k.organization_id}_${k.scenario_master_id}`))
  const filterByKeys = !keyResult.error && keys.length > 0
  const scenarioByKey = new Map<string, PerformanceScenarioRow>()
  const scenarioIdsByOrg = new Map<string, Set<string>>()
  const scenarioById = new Map<string, PlatformScenario>()
  for (const s of scenarioResult.data ?? []) {
    if (!s.organization_id || !orgById.has(s.organization_id)) continue
    if (filterByKeys && s.scenario_master_id && !keySet.has(`${s.organization_id}_${s.scenario_master_id}`)) continue
    scenarioByKey.set(`${s.organization_id}_${s.id}`, s)
    const prev = scenarioById.get(s.id)
    if (!prev || (!prev.slug && s.slug)) {
      scenarioById.set(s.id, {
        id: s.id,
        slug: s.slug || prev?.slug || s.id,
        title: s.title || prev?.title || '',
        author: s.author || prev?.author || '',
        key_visual_url: s.key_visual_url ?? prev?.key_visual_url ?? null,
        genres: s.genre ?? [],
        player_count_min: s.player_count_min ?? 1,
        player_count_max: s.player_count_max ?? 8,
        release_date: s.release_date ?? null,
        listed_at: earlier(s.created_at ?? null, prev?.listed_at ?? null),
        organizations: [...(prev?.organizations ?? []), { organization_id: s.organization_id, available_from: s.available_from ?? null, available_until: s.available_until ?? null }],
        is_recommended: !!s.is_recommended || !!prev?.is_recommended,
      })
    } else {
      if (s.is_recommended) prev.is_recommended = true
      prev.listed_at = earlier(s.created_at ?? null, prev.listed_at)
      prev.organizations.push({ organization_id: s.organization_id, available_from: s.available_from ?? null, available_until: s.available_until ?? null })
    }
    if (!scenarioIdsByOrg.has(s.organization_id)) scenarioIdsByOrg.set(s.organization_id, new Set())
    scenarioIdsByOrg.get(s.organization_id)!.add(s.id)
  }

  // 店舗の公演募集停止期間（予約は DB でも止まる。表示を合わせるだけ）
  const events = (eventResult.data ?? []).filter(isPublicOpenEvent)
  let pauses: StoreRecruitmentPausePeriod[] = []
  const eventStoreIds = [...new Set(events.map((e) => e.store_id).filter((id): id is string => Boolean(id)))]
  if (eventStoreIds.length > 0) {
    const { data, error } = await publicBookingReadApi.listPerformancePauses(eventStoreIds)
    if (error) logger.error('全体トップ: 募集停止期間の取得に失敗', error)
    else pauses = (data ?? []) as StoreRecruitmentPausePeriod[]
  }

  const performances: PublicPerformance[] = []
  for (const e of events) {
    const org = e.organization_id ? orgById.get(e.organization_id) : undefined
    if (!org || !e.scenario_master_id) continue
    if (e.store_id && storeHasRecruitmentPause(e.date, e.store_id, 'performance', pauses)) continue
    const p = buildPublicPerformance(e, scenarioByKey.get(`${org.id}_${e.scenario_master_id}`), e.store_id ? storeById.get(e.store_id) : null, org)
    if (p) performances.push(p)
  }

  const { organizations, prefectures } = buildPlatformOrganizations(orgs, stores, scenarioIdsByOrg)
  return {
    organizations, scenarios: [...scenarioById.values()], performances, prefectures,
    stores: stores.map((s) => ({ id: s.id, organization_id: s.organization_id as string, status: s.status ?? null, is_temporary: s.is_temporary ?? null })),
  }
}

/** 早いほうの日時（片方が無ければもう片方） */
function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b
}

type OrganizationRow = { id: string; slug: string; name: string; logo_url?: string | null }
type StoreRow = Parameters<typeof isPublicRegularStore>[0] & Parameters<typeof storePrefecture>[0] & Parameters<typeof storeDisplayName>[0] & { id: string; organization_id?: string | null }

/** 組織カードの材料（公開中の店舗が 1 つ以上ある組織だけ）と、店舗がある都道府県（店舗数の多い順） */
export function buildPlatformOrganizations(
  orgs: readonly OrganizationRow[],
  stores: readonly StoreRow[],
  scenarioIdsByOrg: ReadonlyMap<string, ReadonlySet<string>>,
): { organizations: PlatformOrganization[]; prefectures: string[] } {
  const prefectureCount = new Map<string, number>()
  const organizations: PlatformOrganization[] = []
  for (const org of orgs) {
    const regular = stores.filter((s) => s.organization_id === org.id && isPublicRegularStore(s))
    if (regular.length === 0) continue
    const prefectures: string[] = []
    regular.forEach((s) => {
      const p = storePrefecture(s)
      if (p && !prefectures.includes(p)) prefectures.push(p)
      if (p) prefectureCount.set(p, (prefectureCount.get(p) ?? 0) + 1)
    })
    const named = regular.map((s) => ({ id: s.id, name: storeDisplayName(s, { organizationName: org.name }) }))
    organizations.push({
      id: org.id,
      slug: org.slug,
      name: org.name,
      logo_url: org.logo_url ?? null,
      store_names: named.map((s) => s.name),
      stores: named,
      store_count: regular.length,
      prefectures,
      scenario_count: scenarioIdsByOrg.get(org.id)?.size ?? 0,
    })
  }
  const prefectures = [...prefectureCount.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  return { organizations, prefectures }
}

/**
 * 貸切を始めるページ用: 組織カードの材料だけ（公演は読まない）。
 * 作品数は全体トップと同じ数え方（公開キーがあればそれに含まれる作品）。
 */
export async function fetchPlatformOrganizations(): Promise<{ organizations: PlatformOrganization[]; prefectures: string[] }> {
  const [orgResult, storeResult, scenarioResult, keyResult] = await Promise.all([
    platformPageReadApi.listActiveOrganizations(),
    publicBookingListReadApi.listPublicStores(null),
    publicBookingListReadApi.listAvailableScenarios(null),
    platformPageReadApi.getPublicAvailableScenarioKeys(),
  ])
  if (orgResult.error) throw orgResult.error
  if (storeResult.error) logger.error('貸切を始める: 店舗の取得に失敗', storeResult.error)
  if (scenarioResult.error) logger.error('貸切を始める: 作品の取得に失敗', scenarioResult.error)
  const orgs = orgResult.data ?? []
  const orgIds = new Set(orgs.map((o) => o.id))
  const keys = keyResult.data ?? []
  const keySet = new Set(keys.map((k: { organization_id: string; scenario_master_id: string }) => `${k.organization_id}_${k.scenario_master_id}`))
  const filterByKeys = !keyResult.error && keys.length > 0
  const scenarioIdsByOrg = new Map<string, Set<string>>()
  for (const s of scenarioResult.data ?? []) {
    if (!s.organization_id || !orgIds.has(s.organization_id)) continue
    if (filterByKeys && s.scenario_master_id && !keySet.has(`${s.organization_id}_${s.scenario_master_id}`)) continue
    if (!scenarioIdsByOrg.has(s.organization_id)) scenarioIdsByOrg.set(s.organization_id, new Set())
    scenarioIdsByOrg.get(s.organization_id)!.add(s.id)
  }
  const stores = (storeResult.data ?? []).filter((s) => s.organization_id && orgIds.has(s.organization_id))
  return buildPlatformOrganizations(orgs, stores, scenarioIdsByOrg)
}
