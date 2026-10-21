/**
 * 同時に飛んでいる同じ読み取りを 1 回の通信にまとめる（Supabase クライアントに依存しない小さな部品）
 *
 * 共有してよいのは「同じ利用者・同じ組織・保存をはさまない」間だけ。
 * - 範囲の世代（scope）: 利用者が確定・交代したとき（noteAuthUser）、組織を切り替えたとき（invalidateSharedRequests）に進む。
 *   範囲の世代は、モジュールに持つキャッシュ（作品一覧・組織 ID）の読み書きの照合にも使う（currentScopeGeneration）
 * - 書き込みの世代: 保存が終わったとき（invalidateAfterWrite）に進む
 * - どちらかの世代が進んだあとの呼び出しは、飛んでいる古い取得に相乗りせず新しく取る（古い取得は、それを頼んだ呼び出しにだけ返る）
 * - 取得が終わったら共有をやめる（キャッシュではない）
 */
let scopeGeneration = 0
let writeGeneration = 0
const inFlight = new Map<string, { scope: number; write: number; promise: Promise<unknown> }>()

export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inFlight.get(key)
  if (hit && hit.scope === scopeGeneration && hit.write === writeGeneration) return hit.promise as Promise<T>
  const entry = { scope: scopeGeneration, write: writeGeneration, promise: Promise.resolve() as Promise<unknown> }
  const promise = run().finally(() => {
    if (inFlight.get(key) === entry) inFlight.delete(key)
  })
  entry.promise = promise
  inFlight.set(key, entry)
  return promise
}

/** 今の範囲の世代。モジュールのキャッシュは、書いたときの世代と今の世代が同じときだけ使う・書く */
export function currentScopeGeneration(): number {
  return scopeGeneration
}

/** 組織の切替のあとに呼ぶ。以後の呼び出しは飛んでいる取得に相乗りせず、範囲つきのキャッシュも使わない */
export function invalidateSharedRequests(): void {
  scopeGeneration++
  inFlight.clear()
}

/** 保存のあとに呼ぶ。以後の呼び出しは、保存前に始まった取得に相乗りしない */
export function invalidateAfterWrite(): void {
  writeGeneration++
  inFlight.clear()
}

let lastAuthUserId: string | null | undefined
/**
 * 認証の状態が変わるたびに呼ぶ（src/lib/supabase.ts）。利用者が確定・交代したら範囲の世代を進める。
 * 初めての確定（未確定 → 利用者）も交代として扱い、確定前に始まった取得には相乗りしない
 */
export function noteAuthUser(userId: string | null): void {
  if (lastAuthUserId !== userId) invalidateSharedRequests()
  lastAuthUserId = userId
}
