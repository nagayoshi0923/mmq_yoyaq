/**
 * 同じ保存が 3 回続けて失敗したら、次からは前回の失敗から 10 秒空けて送る（2026-10-13 恒久対応 4）。
 *
 * 背景: 古い版の画面を開いたままの端末が、失敗する保存を即座に再送し続け（毎秒約 700 件）、
 * DB 全体が重くなった。画面のどこで再送が起きても、送る前にここで待たせればループの速さが落ちる。
 * 同じ要求（操作名＋送る内容）ごとに数え、成功したら数を消す。端末の中だけで数える（保存はしない）。
 */
const FREE_FAILURES = 3
const WAIT_MS = 10_000
const MAX_KEYS = 200

type Counter = { failures: number; lastFailureAt: number }
const counters = new Map<string, Counter>()

export function requestKey(name: string, payload: unknown): string {
  let body: string
  try { body = typeof payload === 'string' ? payload : JSON.stringify(payload) ?? '' } catch { body = '' }
  return `${name}|${body}`
}

/** 今送る前に待つべきミリ秒（待たなくてよければ 0）。 */
export function backoffDelayMs(key: string, now = Date.now()): number {
  const c = counters.get(key)
  if (!c || c.failures < FREE_FAILURES) return 0
  return Math.max(0, c.lastFailureAt + WAIT_MS - now)
}

export function noteRequestResult(key: string, failed: boolean, now = Date.now()) {
  if (!failed) { counters.delete(key); return }
  const c = counters.get(key)
  if (c) { c.failures += 1; c.lastFailureAt = now; return }
  if (counters.size >= MAX_KEYS) counters.delete(counters.keys().next().value as string)
  counters.set(key, { failures: 1, lastFailureAt: now })
}

/** 失敗が続いている要求なら待ってから send を実行し、結果を記録する。 */
export async function withRepeatFailureBackoff<T>(key: string, send: () => Promise<T>, isFailure: (result: T) => boolean): Promise<T> {
  const delay = backoffDelayMs(key)
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
  let result: T
  try {
    result = await send()
  } catch (error) {
    noteRequestResult(key, true)
    throw error
  }
  noteRequestResult(key, isFailure(result))
  return result
}

/** テスト用 */
export function resetRepeatFailureBackoff() {
  counters.clear()
}
