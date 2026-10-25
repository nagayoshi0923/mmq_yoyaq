/**
 * 店舗トップ・全体トップの公演を読む期間の計算（画面の部品やデータの取得に依存しない、試験しやすい関数だけ）。
 * 2026-10-25 社長報告「カレンダーが 12 月以降に切り替えられない」「今月バッジ廃止、予定公演を30日分、末尾にもっとみる」。
 */

/** today（JST の YYYY-MM-DD）から months か月後の月末（0 なら今月末） */
export function endOfJstMonthAfter(today: string, months: number): string {
  const [y, m] = today.split('-').map(Number)
  const last = new Date(Date.UTC(y, m + months, 0))
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`
}

/** 最初に読む期間の終わり: 今日から 2 か月後の月末（従来どおり。今月を含む 3 か月） */
export function defaultBookingRangeEnd(today: string): string {
  return endOfJstMonthAfter(today, 2)
}

/** YYYY-MM の月末（YYYY-MM-DD） */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/** from の月から to の月まで（両端を含む）の YYYY-MM */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/**
 * 読み足す月: loadedUntil の翌日の月から until の月まで（loadedUntil が until 以降なら無し）。
 * 最初の取得に失敗したとき loadedUntil は今日の前日なので、今月から読み足す。
 */
export function extraMonthsToLoad(loadedUntil: string, until: string | null): string[] {
  if (!until || until <= loadedUntil) return []
  const [y, m, d] = loadedUntil.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return monthsBetween(next, until)
}

/** latestPublicDate を読めなかったときの上限: 今月から 12 か月（上限が分からないまま 1 か月ずつ読める範囲） */
export const UNKNOWN_LATEST_MONTHS = 12

/**
 * 月送りで選べる最後の月（YYYY-MM）と「もっと見る」を出す最後の日。
 * 予約を受け付けている公開の公演がある最後の月まで（最初に読む 3 か月より短くはしない）。
 * それを読めなかったときは今月から 12 か月まで（狭めて先へ進めなくしない。月ごとに読むので取りすぎない）。
 */
export function browseLimits(today: string, defaultEnd: string, latestPublicDate: string | null, latestError: boolean): { lastMonth: string; moreUntil: string | null } {
  if (latestError) {
    const last = monthsBetween(today, today)[0]
    const [y, m] = last.split('-').map(Number)
    const lm = new Date(Date.UTC(y, m - 1 + UNKNOWN_LATEST_MONTHS - 1, 1))
    const lastMonth = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}`
    return { lastMonth, moreUntil: monthEnd(lastMonth) }
  }
  const lastMonth = latestPublicDate && latestPublicDate.slice(0, 7) > defaultEnd.slice(0, 7) ? latestPublicDate.slice(0, 7) : defaultEnd.slice(0, 7)
  return { lastMonth, moreUntil: latestPublicDate }
}

/** 今の表示に要る期間の終わり（カードは表示している期間の終わり、カレンダー・リストは表示中の月末。最後の月を超えない） */
export function requiredUntil(input: { cardsUntil: string | null; visibleMonth: string | null; lastMonth: string }): string | null {
  const cap = monthEnd(input.lastMonth)
  const wants = [input.cardsUntil, input.visibleMonth ? monthEnd(input.visibleMonth) : null].filter((v): v is string => !!v)
  if (wants.length === 0) return null
  const want = wants.sort().at(-1)!
  return want > cap ? cap : want
}

/** 2 つの並びを id で一意にしてつなぐ（先の並びを優先） */
export function uniqueById<T extends { id: string }>(first: readonly T[], second: readonly T[]): T[] {
  if (second.length === 0) return first as T[]
  const seen = new Set(first.map((x) => x.id))
  return [...first, ...second.filter((x) => !seen.has(x.id))]
}
