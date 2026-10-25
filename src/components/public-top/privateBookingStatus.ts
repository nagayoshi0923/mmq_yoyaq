/**
 * トップの新作一覧のカードの「貸切受付中」（2026-10-24 社長: 公演日が無くても貸切を受け付けていることを分かるように。QW-20261023-001）。
 * 「日程の相談を始められる」という意味で、空き枠の保証ではない（日付×枠の空きは日程を選ぶ画面で DB が決める）。
 *
 * 判定は lib/privateBookingAcceptance の privateBookingStatusWithStores（既存の判定をまとめたもの）だけを使う。
 * 材料:
 * - 貸切受付 ON/OFF・出張限定・貸切募集期間・公演可能店舗: 貸切を始めるページと同じ公開 API（scenarioApi.getPublic）
 * - 公演期間: 公開ビュー（listAvailableScenarios の available_from / available_until）
 * - 受付締切・受付範囲の日数: 作品ごとの RPC（get_effective_private_booking_deadline_days / _horizon_days。保存の判定と同じ値）
 * - 店舗と貸切の募集停止: 公開の店舗（stores_public）と store_recruitment_pauses（pause_type='private'）
 * どれかが読めない・列が欠けている作品は unknown（出さない）。
 * - 組織トップ: その組織の行と店舗だけで決める。
 * - 全体トップ: その作品を公開している組織ごとに決め、1 つでも accepting なら受付中（組織をまたいで店舗・停止を混ぜない）。
 * 作品ごとに RPC を 2 回読むので、対象は新作一覧（最大 12 件）に限る。
 */
import { scenarioApi } from '@/lib/api'
import { publicBookingReadApi } from '@/lib/api/publicBookingReadApi'
import {
  privateBookingDateWindow,
  privateBookingStatus,
  privateBookingStatusWithStores,
  type PrivateBookingAcceptanceInput,
  type PrivateBookingPeriodInput,
  type PrivateBookingStatus,
} from '@/lib/privateBookingAcceptance'
import { isStorePlayableForScenario } from '@/lib/scenarioStoreHint'
import type { StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
import { logger } from '@/utils/logger'
import { privateScenarioTabPath } from '@/pages/PrivateBookingStart/paths'

export type PrivateBookingRow = PrivateBookingAcceptanceInput & PrivateBookingPeriodInput & {
  available_stores?: string[] | null
}

/** 公開の店舗（stores_public の行。オフィスはビューで除かれている） */
export interface PrivateBookingStore {
  id: string
  organization_id?: string | null
  status?: string | null
  is_temporary?: boolean | null
  ownership_type?: string | null
}

type Pause = StoreRecruitmentPausePeriod & { organization_id?: string }

export interface PrivateBookingData {
  /** 組織 ID → 作品 ID（公開ビューの id = 作品マスタ ID）→ 貸切受付の値。読めなかった組織は入らない */
  rows: ReadonlyMap<string, ReadonlyMap<string, PrivateBookingRow>>
  /** 店舗の貸切募集停止期間。読めなかったら null（全作品 unknown） */
  pauses: Pause[] | null
}

/** `${組織ID}:${作品ID}` → 受付締切・受付範囲の日数。読めなかった組は入らない */
export type PrivateBookingDays = ReadonlyMap<string, { deadlineDays: number; horizonDays: number }>

/** 作品の公演期間（公開ビュー） */
export interface ScenarioPeriod {
  /** undefined = 読めていない（unknown）、null = 未設定（制限なし） */
  available_from?: string | null
  available_until?: string | null
}

const ROW_KEYS = ['accepts_private_booking', 'scenario_kind', 'booking_start_date', 'booking_end_date', 'available_stores'] as const

export const daysKey = (organizationId: string, scenarioId: string) => `${organizationId}:${scenarioId}`

/**
 * 組織ごとの公開 API と、店舗の貸切募集停止期間を読む。
 * 判定に要る列が応答に無い行は入れない（undefined を「制限なし」と取り違えない）。
 */
export async function fetchPrivateBookingData(organizationIds: readonly string[], storeIds: readonly string[]): Promise<PrivateBookingData> {
  const rows = new Map<string, Map<string, PrivateBookingRow>>()
  const pauseTask = (async () => {
    const ids = [...new Set(storeIds)]
    if (ids.length === 0) return [] as Pause[]
    const { data, error } = await publicBookingReadApi.listPrivatePauses(ids)
    if (error) {
      logger.warn('貸切の募集停止期間を読めませんでした（貸切受付中は出さない）', error)
      return null
    }
    return (data ?? []) as Pause[]
  })().catch((error) => {
    logger.warn('貸切の募集停止期間を読めませんでした（貸切受付中は出さない）', error)
    return null
  })
  await Promise.all([...new Set(organizationIds)].map(async (orgId) => {
    try {
      const list = (await scenarioApi.getPublic(orgId)) as Array<Record<string, unknown>>
      const map = new Map<string, PrivateBookingRow>()
      for (const r of list ?? []) {
        const id = typeof r.id === 'string' ? r.id : null
        if (!id || ROW_KEYS.some((k) => !(k in r) || r[k] === undefined)) continue
        map.set(id, {
          accepts_private_booking: r.accepts_private_booking as boolean | null,
          scenario_kind: r.scenario_kind as string | null,
          booking_start_date: r.booking_start_date as string | null,
          booking_end_date: r.booking_end_date as string | null,
          available_stores: r.available_stores as string[] | null,
        })
      }
      rows.set(orgId, map)
    } catch (error) {
      logger.warn('貸切受付の状況を読めませんでした（その組織の作品は「貸切受付中」を出さない）', error)
    }
  }))
  return { rows, pauses: await pauseTask }
}

/** 0〜90 の整数（DB の締切日数の範囲）。それ以外・読めないときは null */
function deadlineValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 90 ? value : null
}
/** 1〜180 の整数（受付範囲の日数の範囲）。それ以外・読めないときは null */
function horizonValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 180 ? value : null
}

/**
 * 作品ごとの受付締切・受付範囲の日数を読む（保存の判定 assert_private_booking_candidate_date と同じ RPC・同じ作品の値）。
 * 読めなかった組は入れない（その作品は unknown）。
 */
export async function fetchPrivateBookingDays(pairs: ReadonlyArray<{ organizationId: string; scenarioId: string }>): Promise<PrivateBookingDays> {
  const { privateBookingSlotReadApi } = await import('@/lib/api/scheduleHookReadApi')
  const result = new Map<string, { deadlineDays: number; horizonDays: number }>()
  const unique = [...new Map(pairs.map((p) => [daysKey(p.organizationId, p.scenarioId), p])).values()]
  await Promise.all(unique.map(async ({ organizationId, scenarioId }) => {
    try {
      const [deadline, horizon] = await Promise.all([
        privateBookingSlotReadApi.getEffectiveDeadlineDays({ scenarioId, organizationId, organizationSlug: null }),
        privateBookingSlotReadApi.getEffectiveHorizonDays({ organizationId, scenarioId }),
      ])
      const d = deadline.error ? null : deadlineValue(deadline.data)
      const h = horizon.error ? null : horizonValue(horizon.data)
      if (d !== null && h !== null) result.set(daysKey(organizationId, scenarioId), { deadlineDays: d, horizonDays: h })
    } catch (error) {
      logger.warn('受付締切・受付範囲を読めませんでした（その作品は「貸切受付中」を出さない）', error)
    }
  }))
  return result
}

function playableStoreIds(organizationId: string, row: PrivateBookingRow, orgStores: readonly PrivateBookingStore[] | null): string[] | null {
  if (orgStores === null) return null
  return orgStores
    .filter((s) => !s.organization_id || s.organization_id === organizationId)
    .filter((s) => isStorePlayableForScenario({ id: s.id, ownership_type: s.ownership_type ?? null, is_temporary: s.is_temporary ?? null, status: s.status ?? null }, row.available_stores))
    .map((s) => s.id)
}

/** 日数を読む前の下見: 作品単位で受付中か（受付締切・受付範囲の RPC を読む作品を絞るのに使う） */
export function isPrivateBookingCandidate(data: PrivateBookingData | undefined, organizationId: string, scenarioId: string, period: ScenarioPeriod, todayJst: string): boolean {
  const row = data?.rows.get(organizationId)?.get(scenarioId)
  return !!row && privateBookingStatus({ ...row, available_until: period.available_until }, todayJst) === 'accepting'
}

/** ある組織での作品の受付状況。行・店舗・停止期間・公演期間・日数のどれかが分からなければ unknown */
export function orgScenarioPrivateStatus(
  data: PrivateBookingData | undefined,
  days: PrivateBookingDays | undefined,
  organizationId: string,
  scenarioId: string,
  period: ScenarioPeriod,
  orgStores: readonly PrivateBookingStore[] | null,
  todayJst: string,
): PrivateBookingStatus {
  const row = data?.rows.get(organizationId)?.get(scenarioId)
  if (!data || !row || period.available_from === undefined) return 'unknown'
  const d = days?.get(daysKey(organizationId, scenarioId))
  const window = d === undefined ? undefined : privateBookingDateWindow({
    todayJst, deadlineDays: d.deadlineDays, horizonDays: d.horizonDays,
    available_from: period.available_from, available_until: period.available_until ?? null,
  })
  // DB の判定と同じく、その組織の停止だけを見る（pz.organization_id = p_org）
  const pauses = data.pauses === null ? null : data.pauses.filter((p) => !p.organization_id || p.organization_id === organizationId)
  return privateBookingStatusWithStores({ ...row, available_until: period.available_until }, playableStoreIds(organizationId, row, orgStores), pauses, window, todayJst)
}

/** 組織トップのカード: その組織で受付中なら、作品ページの貸切リクエストのタブ（日程相談）へのパス */
export function orgPrivateBookingPath(
  data: PrivateBookingData | undefined,
  days: PrivateBookingDays | undefined,
  org: { id: string; slug: string },
  scenario: { id: string; slug?: string | null } & ScenarioPeriod,
  orgStores: readonly PrivateBookingStore[] | null,
  todayJst: string,
): string | null {
  return orgScenarioPrivateStatus(data, days, org.id, scenario.id, scenario, orgStores, todayJst) === 'accepting'
    ? privateScenarioTabPath(org.slug, scenario)
    : null
}

/**
 * 全体トップのカード: 公開している組織のうち受付中の組織が 1 つならその組織の貸切リクエストのタブ、
 * 複数なら作品の共通ページ（組織ごとの「貸切リクエスト」が並ぶ）。どこも受付中でなければ null。
 */
export function platformPrivateBookingPath(
  data: PrivateBookingData | undefined,
  days: PrivateBookingDays | undefined,
  scenario: { id: string; slug: string; organizations: ReadonlyArray<{ organization_id: string } & ScenarioPeriod> },
  orgSlugById: ReadonlyMap<string, string>,
  stores: readonly PrivateBookingStore[] | null,
  todayJst: string,
): string | null {
  const accepting = scenario.organizations.filter((o) => (
    orgSlugById.has(o.organization_id)
    && orgScenarioPrivateStatus(data, days, o.organization_id, scenario.id, o, stores === null ? null : stores.filter((s) => s.organization_id === o.organization_id), todayJst) === 'accepting'
  ))
  if (accepting.length === 0) return null
  if (accepting.length === 1) return privateScenarioTabPath(orgSlugById.get(accepting[0].organization_id)!, scenario)
  return `/scenario/${encodeURIComponent(scenario.slug || scenario.id)}`
}
