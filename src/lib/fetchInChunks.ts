// IDを100件ずつに分け、同時に最大 CHUNK_CONCURRENCY 件まで取りに行く（#835）。
// 順番に1件ずつ待つと、貸切予約管理を開くたびに件数分の往復を待つことになる。結果の並びは元の順を保つ。
// 同時に動く取得の数は、画面全体（この部品を使うすべての呼び出し）で CHUNK_CONCURRENCY 件までにする（#837）。
const CHUNK_SIZE = 100
const CHUNK_CONCURRENCY = 6

let active = 0
const waiting: Array<() => void> = []

async function acquire(): Promise<void> {
  if (active < CHUNK_CONCURRENCY) { active++; return }
  await new Promise<void>(resolve => waiting.push(resolve))
}

function release(): void {
  const next = waiting.shift()
  if (next) next() // 枠をそのまま次へ渡す
  else active--
}

export async function fetchInChunks<T>(ids: string[], fetchChunk: (chunk: string[]) => Promise<T>): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) chunks.push(ids.slice(i, i + CHUNK_SIZE))
  const results: T[] = new Array(chunks.length)
  let next = 0
  // 1件でも失敗したら、まだ始めていない分は取りに行かない（従来の順番待ちと同じく最初の失敗で止める）
  let failed = false
  const worker = async () => {
    while (!failed && next < chunks.length) {
      const index = next++
      await acquire()
      try {
        if (failed) return
        results[index] = await fetchChunk(chunks[index])
      } catch (error) {
        failed = true
        throw error
      } finally {
        release()
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker))
  return results
}
