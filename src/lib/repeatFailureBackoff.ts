/** 再送を待機キューに残さない。失敗後は最新画面から明示的に再試行する。 */
const FREE_FAILURES = 3
const WAIT_MS = 10_000
const MAX_KEYS = 200
type Counter = { failures: number; lastFailureAt: number }
const counters = new Map<string, Counter>()
const inFlight = new Set<string>()
const PREFIX = 'mmq-write-backoff-v1:'

export class WriteBackoffError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('保存が続いています。少し待って画面の最新内容を確認してから保存してください')
    this.name = 'WriteBackoffError'
  }
}

/** 保存内容・認証情報をlocalStorageやlock名に残さず、操作単位で制限する。 */
export function requestKey(name: string, _payload?: unknown): string { return name }
function storageKey(key: string): string {
  let hash = 2166136261
  for (const char of key) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return PREFIX + (hash >>> 0).toString(16)
}
function readCounter(key: string): Counter | undefined {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (raw) {
      const value = JSON.parse(raw) as Counter
      if (Number.isFinite(value.failures) && Number.isFinite(value.lastFailureAt)) return value
    }
  } catch { /* storage不可では同一タブの制限を維持 */ }
  return counters.get(key)
}

export function backoffDelayMs(key: string, now = Date.now()): number {
  const c = readCounter(key)
  if (!c || c.failures < FREE_FAILURES) return 0
  return Math.max(0, Math.min(WAIT_MS, c.lastFailureAt + WAIT_MS - now))
}

export function noteRequestResult(key: string, failed: boolean, now = Date.now()) {
  const previous = readCounter(key)
  const c = failed ? { failures: (previous && now - previous.lastFailureAt < WAIT_MS ? previous.failures : 0) + 1, lastFailureAt: now } : undefined
  if (c) {
    if (counters.size >= MAX_KEYS) counters.delete(counters.keys().next().value as string)
    counters.set(key, c)
  } else counters.delete(key)
  try {
    const k = storageKey(key)
    if (c) localStorage.setItem(k, JSON.stringify(c))
    else localStorage.removeItem(k)
  } catch { /* storage不可でも送信は可能 */ }
}

export async function withRepeatFailureBackoff<T>(key: string, send: () => Promise<T>, isFailure: (result: T) => boolean): Promise<T> {
  const run = async () => {
    const delay = backoffDelayMs(key)
    if (delay > 0 || inFlight.has(key)) throw new WriteBackoffError(delay || 1000)
    inFlight.add(key)
    try {
      const result = await send()
      noteRequestResult(key, isFailure(result))
      return result
    } catch (error) {
      noteRequestResult(key, true)
      throw error
    } finally { inFlight.delete(key) }
  }
  // 同一originの複数タブも即時拒否。待機した古いpayloadは一切送らない。
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(storageKey(key), { ifAvailable: true }, lock => {
      if (!lock) throw new WriteBackoffError(1000)
      return run()
    })
  }
  return run()
}

export function resetRepeatFailureBackoff() { counters.clear(); inFlight.clear() }
