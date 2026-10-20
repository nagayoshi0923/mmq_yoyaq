/**
 * 空き状況・候補日を読み直したときに、利用者が選んだものを保ったまま「選べなくなったものだけ」を外す（2026-10-20 Codex staging 点検）。
 * 読み直しで選択を初期化しない。外したものは理由と一緒に返し、画面で知らせる。
 */
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'

export interface RemovedSelection {
  /** 「11/29 午後」など、画面に出す見出し */
  label: string
  reason: string
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return m && d ? `${m}/${d}` : date
}

/**
 * 候補日カレンダーで選んだ枠を、読み直した空き状況に合わせる。
 * - その日を読み直していない（別の月など）枠はそのまま
 * - 選べなくなった枠は外し、理由を返す
 * - 選べるが DB の時刻が変わった枠は、時刻だけ DB の値にそろえる（保存で弾かれないように）
 * 何も変わらなければ同じ配列を返す。
 */
export function keepSelectedSlots<T extends { date: string; slot: PrivateBookingSlot }>(
  selected: ReadonlyArray<T>,
  availability: CandidateSlotAvailability,
): { next: T[]; removed: RemovedSelection[]; changed: boolean } {
  const removed: RemovedSelection[] = []
  let changed = false
  const next: T[] = []
  for (const item of selected) {
    const slots = availability.slotsByDate[item.date]
    if (!slots) { next.push(item); continue }
    const reason = availability.unavailableReasons[`${item.date}-${item.slot.label}`]
    const current = slots.find(s => s.label === item.slot.label)
    if (reason || !current || !current.startTime || !current.endTime) {
      removed.push({ label: `${shortDate(item.date)} ${item.slot.label}`, reason: reason || '選べなくなりました' })
      changed = true
      continue
    }
    if (current.startTime !== item.slot.startTime || current.endTime !== item.slot.endTime) {
      next.push({ ...item, slot: { ...item.slot, startTime: current.startTime, endTime: current.endTime, adjusted: current.adjusted } })
      changed = true
      continue
    }
    next.push(item)
  }
  return { next: changed ? next : [...selected], removed, changed }
}

/**
 * 申込シートで選んだ候補日（id の並び＝優先順）を、読み直した候補日に合わせる。
 * 消えた候補日・選べなくなった候補日だけを外し、残りの並びは変えない。
 */
export function keepPickedCandidates(
  picks: ReadonlyArray<string>,
  candidates: ReadonlyArray<{ id: string; label: string }>,
  blockedReason: (id: string) => string | null,
  previousLabels: ReadonlyMap<string, string> = new Map(),
): { next: string[]; removed: RemovedSelection[] } {
  const removed: RemovedSelection[] = []
  const next = picks.filter(id => {
    const c = candidates.find(x => x.id === id)
    if (!c) {
      removed.push({ label: previousLabels.get(id) ?? '候補日', reason: '候補日が取り下げられたか、店舗が見送りました' })
      return false
    }
    const reason = blockedReason(id)
    if (reason) {
      removed.push({ label: c.label, reason })
      return false
    }
    return true
  })
  return { next, removed }
}

/** 外した候補のお知らせ文 */
export function removedSelectionMessage(removed: ReadonlyArray<RemovedSelection>): string {
  return `選べなくなった候補を外しました: ${removed.map(r => `${r.label}（${r.reason}）`).join('、')}`
}
