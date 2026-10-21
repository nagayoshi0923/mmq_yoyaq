/**
 * 公開の公演・作品・店舗の行から、お客様向けの公演 1 件（PublicPerformance）を作る。
 * 店舗トップ（useBookingData の結果）と全体トップ（全組織の公開ビュー）で共通。
 */
import { getAvailableSeats } from '@/lib/participantUtils'
import { isBeginnerFriendly, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { storeDisplayName, storePrefecture, storeShortDisplayName, type StoreAreaSource, type StoreNameSource } from '@/lib/publicStoreName'
import { calculateParticipationFee, isWeekendOrHoliday, type ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'

export interface PerformanceEventRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  store_id: string | null
  venue?: string | null
  current_participants: number | null
  max_participants?: number | null
  capacity?: number | null
  reservation_deadline_hours?: number | null
  organization_id: string | null
  scenario_master_id: string | null
  category?: string | null
  is_private_booking?: boolean | null
  published?: boolean | null
  is_reservation_enabled?: boolean | null
  is_extended?: boolean | null
}

export interface PerformanceScenarioRow {
  id: string
  slug?: string | null
  title: string | null
  key_visual_url?: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration?: number | null
  weekend_duration?: number | null
  participation_fee?: number | null
  participation_costs?: unknown
  genre?: string[] | null
}

export type PerformanceStoreRow = StoreNameSource & StoreAreaSource & { id: string; color?: string | null }

export interface PerformanceOrganization {
  id: string
  slug: string
  name: string
}

/** 予約サイトに出す一般公演か（貸切・非公開・受付停止を除く） */
export function isPublicOpenEvent(row: PerformanceEventRow): boolean {
  if (row.category !== 'open' && row.category !== 'offsite') return false
  if (row.is_private_booking === true) return false
  if (row.published === false) return false
  if (row.is_reservation_enabled === false) return false
  return true
}

export function buildPublicPerformance(
  row: PerformanceEventRow,
  scenario: PerformanceScenarioRow | null | undefined,
  store: PerformanceStoreRow | null | undefined,
  organization: PerformanceOrganization,
): PublicPerformance | null {
  if (!scenario || !row.date) return null
  const playerMax = scenario.player_count_max || 8
  const playerMin = scenario.player_count_min || 1
  const isWeekend = isWeekendOrHoliday(row.date)
  const duration = (isWeekend && scenario.weekend_duration) ? scenario.weekend_duration : (scenario.duration ?? null)
  const baseFee = scenario.participation_fee ?? null
  const costs = Array.isArray(scenario.participation_costs) ? (scenario.participation_costs as ParticipationCost[]) : undefined
  const fee = baseFee === null ? null : calculateParticipationFee(baseFee, costs, row.date, undefined, row.start_time ?? undefined)
  const genres = scenario.genre ?? []
  return {
    id: row.id,
    date: row.date,
    start_time: (row.start_time || '').slice(0, 5),
    end_time: row.end_time ? row.end_time.slice(0, 5) : null,
    store_id: row.store_id,
    store_name: storeDisplayName(store, { organizationName: organization.name, date: row.date, fallback: row.venue }),
    prefecture: store ? storePrefecture(store) : null,
    organization_id: organization.id,
    organization_slug: organization.slug,
    organization_name: organization.name,
    scenario_id: scenario.id,
    scenario_slug: scenario.slug || scenario.id,
    title: scenario.title || '',
    key_visual_url: scenario.key_visual_url ?? null,
    player_count_min: playerMin,
    player_count_max: playerMax,
    duration_minutes: duration,
    fee,
    available_seats: getAvailableSeats(row, playerMax),
    current_participants: row.current_participants ?? 0,
    reservation_deadline_hours: row.reservation_deadline_hours ?? 0,
    genres,
    beginner_friendly: isBeginnerFriendly(genres),
    store_short_name: storeShortDisplayName(store, row.date, row.venue),
    store_color: store?.color ?? null,
    is_extended: row.is_extended === true,
  }
}
