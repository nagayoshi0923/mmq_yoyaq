/**
 * 同じ送り元が短時間に保存の失敗を繰り返したら、しばらく受け付けない（2026-10-13 恒久対応 4）。
 *
 * 背景: 古い版の画面を開いたままの端末が、失敗する保存を即座に再送し続け（毎秒約 700 件）、
 * DB 全体が重くなった。DB の中で失敗回数を数えると失敗した取引ごと巻き戻って数が残らず、
 * 別接続で記録する dblink も Supabase ではパスワード無しの自己接続ができないため、API 層で数える。
 *
 * - 10 分の窓で、キー（認証済みユーザー＋対象）ごとに失敗回数を数える。成功したら数を消す。
 * - 窓内の失敗が 5 回を超えたら、最後の失敗から min(10, 2×(回数−5)) 秒は DB へ送らず 429 と Retry-After を返す。
 * - 数はサーバーの各インスタンスのメモリに置く（インスタンスが替われば消える）。完全な制限ではなく、
 *   1 台の端末が同じインスタンスへ打ち続けるループを止めるための歯止め。
 */

const WINDOW_MS = 10 * 60 * 1000
const FREE_FAILURES = 5
const MAX_WAIT_SECONDS = 10
const MAX_KEYS = 5000

type Counter = { windowStartedAt: number; failures: number; lastFailureAt: number }
const counters = new Map<string, Counter>()
const inFlight = new Set<string>()

/** RPC開始前に同じ対象の枠を確保する。待機要求は蓄積しない。 */
export function beginWrite(key: string): number {
  const wait = retryAfterSeconds(key)
  if (wait > 0) return wait
  if (inFlight.has(key) || inFlight.size >= MAX_KEYS) return 1
  inFlight.add(key)
  return 0
}

export function endWrite(key: string) { inFlight.delete(key) }

function waitSeconds(failures: number) {
  return Math.min(MAX_WAIT_SECONDS, 2 * (failures - FREE_FAILURES))
}

/** 今は受け付けない場合、あと何秒待つべきかを返す（受け付けるなら 0）。 */
export function retryAfterSeconds(key: string, now = Date.now()): number {
  const c = counters.get(key)
  if (!c || now - c.windowStartedAt > WINDOW_MS || c.failures <= FREE_FAILURES) return 0
  const remainingMs = c.lastFailureAt + waitSeconds(c.failures) * 1000 - now
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
}

export function noteWriteFailure(key: string, now = Date.now()) {
  const c = counters.get(key)
  if (!c || now - c.windowStartedAt > WINDOW_MS) {
    if (counters.size >= MAX_KEYS) {
      for (const [k, v] of counters) if (now - v.windowStartedAt > WINDOW_MS) counters.delete(k)
      if (counters.size >= MAX_KEYS) counters.delete(counters.keys().next().value as string)
    }
    counters.set(key, { windowStartedAt: now, failures: 1, lastFailureAt: now })
    return
  }
  c.failures += 1
  c.lastFailureAt = now
}

export function noteWriteSuccess(key: string) {
  counters.delete(key)
}

/** テスト用 */
export function resetWriteFailureLimiter() {
  counters.clear()
  inFlight.clear()
}
