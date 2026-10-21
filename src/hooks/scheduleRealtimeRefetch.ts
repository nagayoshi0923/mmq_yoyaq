/**
 * Realtime の変更通知から月の公演一覧を取り直す（短時間の連続通知はまとめる）。
 *
 * 取得中に通知が来た場合、その取得は通知より前に始まっており、変更を含まない可能性がある。
 * 以前は「取得中ならスキップ」していたため、担当の保存（GM 名）などの通知を取りこぼし、
 * 古い取得結果のまま表示が残った（2026-10-22 hotfix）。取得が終わるのを待ってから取り直す。
 */
export function createRealtimeRefetcher({ isFetching, invalidate, delayMs = 500 }: {
  isFetching: () => boolean
  invalidate: () => void
  delayMs?: number
}) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  const flush = () => {
    timer = null
    if (!pending) return
    if (isFetching()) {
      timer = setTimeout(flush, delayMs)
      return
    }
    pending = false
    invalidate()
  }
  return {
    notify() {
      pending = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = false
    },
  }
}
