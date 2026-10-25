/**
 * 日時から選ぶ貸切（/{org}/private-booking-select）で、選んだ作品がその日時に申し込めるか（DB の判定の結果）を画面の文にする。
 * 仕様の正本: docs/product-spec/貸切受付ルール.md
 */
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'
import { calculateParticipationFee, type ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'

const SLOT_LABEL: Record<string, string> = { morning: '午前', afternoon: '午後', evening: '夜' }

export type SelectedSlotCheck =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable'; message: string }
  /** 申し込める。startTime/endTime は DB が決めた時刻。changed: 押したチップの時刻と違う */
  | { kind: 'available'; label: string; startTime: string; endTime: string; changed: boolean; message: string }

export function selectedSlotCheck(input: {
  active: boolean
  loading: boolean
  ready: boolean
  error: string | null
  availability: CandidateSlotAvailability
  date: string
  slotKey: string
  /** カレンダー・リストで押したチップの時刻（無ければ空） */
  pickedTime: string
}): SelectedSlotCheck {
  if (!input.active) return { kind: 'idle' }
  if (input.error) return { kind: 'error', message: input.error }
  if (input.loading || !input.ready) return { kind: 'checking' }
  const label = SLOT_LABEL[input.slotKey] ?? input.slotKey
  const reason = input.availability.unavailableReasons[`${input.date}-${label}`]
  const slot = (input.availability.slotsByDate[input.date] ?? []).find((s) => s.key === input.slotKey)
  if (reason || !slot || !slot.startTime) {
    return { kind: 'unavailable', message: `この作品は、選んだ日時（${label}）には申し込めません（${reason || 'この時間帯の枠がありません'}）。ほかの作品か、別の日時を選んでください。` }
  }
  const picked = input.pickedTime.slice(0, 5)
  const changed = Boolean(picked) && picked !== slot.startTime
  const message = changed
    ? `この作品の開始時刻 ${slot.startTime} で申し込みます（${label} ${slot.startTime}〜${slot.endTime}）。選んだ ${picked}〜 とは開始時刻が変わります。`
    : `この作品は ${label} ${slot.startTime}〜${slot.endTime} で申し込みます。`
  return { kind: 'available', label, startTime: slot.startTime, endTime: slot.endTime, changed, message }
}

/** 料金の時間帯を決める時刻。DB が決めた時刻 → URL の時刻 → 時間帯の代表の時刻（午前 10 時・午後 2 時・夜 7 時） */
const SLOT_PRICING_TIME: Record<string, string> = { morning: '10:00', afternoon: '14:00', evening: '19:00' }
export function slotPricingTime(slotKey: string, urlTime?: string | null, decidedTime?: string | null): string | undefined {
  return decidedTime || urlTime || SLOT_PRICING_TIME[slotKey] || undefined
}

/**
 * 選んだ日時での 1 人あたりの料金（作品ページ・申込画面・DB の受付と同じ calculateParticipationFee）。
 * 土日祝・独自休日の料金を使い、基本料金（平日）のまま出さない（2026-10-25 社長報告: 日曜の貸切が平日料金で案内された）。
 * 独自休日を読み込み中・読み込めなかった（error）、または料金が無ければ null（金額を出さない）。
 * 読み込めないまま平日の料金を出すと、独自休日の料金を安く案内してしまう（Codex レビュー 2026-10-25）。
 */
export function privateSelectFee(
  scenario: { participation_fee?: number | null; participation_costs?: ParticipationCost[] | null },
  date: string,
  startTime: string | undefined,
  holidays: { loading: boolean; error?: string | null; isCustomHoliday: (date: string) => boolean },
): number | null {
  if (scenario.participation_fee == null || holidays.loading || holidays.error) return null
  return calculateParticipationFee(scenario.participation_fee, scenario.participation_costs ?? undefined, date || undefined, holidays.isCustomHoliday, startTime)
}
