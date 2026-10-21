/**
 * 同時に飛んでいる同じ読み取りを 1 回の通信にまとめる（Supabase クライアントに依存しない小さな部品）
 *
 * 共有してよいのは「同じ利用者・同じ組織・保存をはさまない」間だけ。
 * - 利用者が替わったら（noteAuthUser）、組織を切り替えたら・保存したら（invalidateSharedRequests）世代を進める
 * - 世代が進んだあとの呼び出しは、飛んでいる古い取得に相乗りせず新しく取る（古い取得は、それを頼んだ呼び出しにだけ返る）
 * - 取得が終わったら共有をやめる（キャッシュではない）
 */
let generation = 0
const inFlight = new Map<string, { generation: number; promise: Promise<unknown> }>()

export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inFlight.get(key)
  if (hit && hit.generation === generation) return hit.promise as Promise<T>
  const entry = { generation, promise: Promise.resolve() as Promise<unknown> }
  const promise = run().finally(() => {
    if (inFlight.get(key) === entry) inFlight.delete(key)
  })
  entry.promise = promise
  inFlight.set(key, entry)
  return promise
}

/** 保存の後・組織の切替の後に呼ぶ。以後の呼び出しは飛んでいる取得に相乗りしない */
export function invalidateSharedRequests(): void {
  generation++
  inFlight.clear()
}

let lastAuthUserId: string | null | undefined
/** 認証の状態が変わるたびに呼ぶ（src/lib/supabase.ts）。利用者が替わったら共有を切る */
export function noteAuthUser(userId: string | null): void {
  if (lastAuthUserId !== undefined && lastAuthUserId !== userId) invalidateSharedRequests()
  lastAuthUserId = userId
}
