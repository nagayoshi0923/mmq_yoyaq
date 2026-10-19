/**
 * 日時から選ぶ貸切（/{org}/private-booking-select）で、選んだ作品がその日時に申し込めるか（DB の判定の結果）を画面の文にする。
 * 仕様の正本: docs/product-spec/貸切受付ルール.md
 */
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'

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
