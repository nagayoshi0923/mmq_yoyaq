/**
 * お客様向けの残席の言い方（2026-10-12 社長決定: 予約サイトのカレンダーと同じ「予約済み/定員」＋「残少」「満席」にそろえる）。
 * 残席がこの数以下なら「残少」の印（赤）。満席は「満席」。キャンセル待ちの言い方は各画面のまま。
 */
export const FEW_SEATS_THRESHOLD = 3

/** 「2/8」（予約済み/定員） */
export function seatCountText(current: number | null | undefined, max: number | null | undefined): string {
  const cap = Math.max(0, max ?? 0)
  const booked = Math.min(cap, Math.max(0, current ?? 0))
  return `${booked}/${cap}`
}

/** 残少（残席が 1〜3） */
export function isFewSeats(available: number): boolean {
  return available > 0 && available <= FEW_SEATS_THRESHOLD
}
