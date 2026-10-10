/**
 * 概要タブ（刷新）で使う計算。画面から切り離して単体テストする。
 */
import { calculateParticipationFee, calculatePrivateCandidateFees, type ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import type { ScenarioCharacter } from '@/pages/ScenarioDetailPage/utils/types'

/** 作品の公開情報（作品ページと同じ公開用の列から） */
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

export type PublicScenarioRow = Record<string, unknown>

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


/** 作品ページの URL（組織の slug 付き）。組織が分からないときは全体の作品ページ */
export function scenarioPageUrl(orgSlug: string | null | undefined, scenarioSlug: string | null | undefined, scenarioMasterId: string | null | undefined): string | null {
  const key = scenarioSlug || scenarioMasterId
  if (!key) return null
  return orgSlug ? `/${encodeURIComponent(orgSlug)}/scenario/${encodeURIComponent(key)}` : `/scenario/${encodeURIComponent(key)}`
}

/** 登場人物として出す項目だけ（NPC・名前なしは除く。並び順どおり）。秘密・真相の項目はそもそも公開用の列に無いが、ここでも持ち出さない */
export interface PublicCharacter {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  imagePosition: string | null
  imageScale: number | null
  backgroundColor: string | null
}

/** 作品ページ・グループの読み取り結果のどちらの形でも受ける（使う列だけ） */
interface CharacterLike {
  id?: string
  name?: string | null
  description?: string | null
  image_url?: string | null
  image_position?: string | null
  image_scale?: number | null
  background_color?: string | null
  is_npc?: boolean | null
  sort_order?: number | null
}

export function publicCharacters(characters: ReadonlyArray<CharacterLike> | null | undefined): PublicCharacter[] {
  return [...(characters ?? [])]
    .filter(c => !c.is_npc && typeof c.name === 'string' && c.name.trim() !== '')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c, i) => ({
      id: c.id || `character-${i}`,
      name: (c.name as string).trim(),
      description: c.description?.trim() || null,
      imageUrl: c.image_url || null,
      imagePosition: c.image_position ?? null,
      imageScale: c.image_scale ?? null,
      backgroundColor: c.background_color ?? null,
    }))
}

/** 開演の 10 分前（「13:50」）。時刻が無ければ null */
export function meetingTime(startTime: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(startTime ?? '')
  if (!m) return null
  const total = Number(m[1]) * 60 + Number(m[2]) - 10
  const t = (total + 24 * 60) % (24 * 60)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** 地図アプリで住所を開く URL */
export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** 確定した公演の店舗を名前で探す（読み取り結果には店舗名しか無いため。正式名・略称のどちらでも） */
export function findStoreByName<S extends { name: string; short_name?: string | null }>(stores: ReadonlyArray<S>, name: string | null | undefined): S | null {
  if (!name) return null
  return stores.find(s => s.name === name) ?? stores.find(s => s.short_name === name) ?? null
}

export interface PriceSummary {
  /** 1 人あたり（候補日によって違えば最小〜最大） */
  perPersonMin: number
  perPersonMax: number
  /** 定員（作品の最大人数） */
  people: number
  totalMin: number
  totalMax: number
}

interface PriceInput {
  phase: PrivateBookingPhase
  fee: number | null
  costs: ParticipationCost[]
  people: number | null
  /** 申込前は候補日、返事待ちは申込んだ候補日 */
  candidates: Array<{ date: string; startTime: string }>
  confirmed: { date: string; startTime: string } | null
  /** 確定時にグループへ保存された金額（あればそれを正とする） */
  savedPerPerson: number | null
  savedTotal: number | null
  isCustomHoliday?: (date: string) => boolean
}

/**
 * 料金の見込み。貸切申込の画面（PrivateBookingRequest）と同じ計算（calculatePrivateCandidateFees）で、
 * 候補日ごとの 1 人あたり × 定員。確定後は確定日の料金（グループに保存済みならそれ）。
 */
export function priceSummary(input: PriceInput): PriceSummary | null {
  const people = input.people && input.people > 0 ? input.people : null
  if (input.phase === 'confirmed' && input.savedPerPerson && input.savedPerPerson > 0 && people) {
    const total = input.savedTotal && input.savedTotal > 0 ? input.savedTotal : input.savedPerPerson * people
    return { perPersonMin: input.savedPerPerson, perPersonMax: input.savedPerPerson, people, totalMin: total, totalMax: total }
  }
  if (!input.fee || input.fee <= 0 || !people) return null
  const dates = input.phase === 'confirmed' && input.confirmed ? [input.confirmed] : input.candidates
  const fees = dates.length
    ? calculatePrivateCandidateFees(input.fee, input.costs, dates.map(d => ({ date: d.date, slot: { startTime: d.startTime } })), input.isCustomHoliday)
    : [calculateParticipationFee(input.fee, input.costs)]
  const min = Math.min(...fees)
  const max = Math.max(...fees)
  return { perPersonMin: min, perPersonMax: max, people, totalMin: min * people, totalMax: max * people }
}

/** 「¥4,500」「¥4,500〜¥5,000」 */
export function yenRange(min: number, max: number): string {
  return min === max ? `¥${min.toLocaleString()}` : `¥${min.toLocaleString()}〜¥${max.toLocaleString()}`
}
