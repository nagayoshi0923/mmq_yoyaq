// IDを100件ずつに分け、同時に最大 CHUNK_CONCURRENCY 件まで取りに行く（#835）。
// 順番に1件ずつ待つと、貸切予約管理を開くたびに件数分の往復を待つことになる。結果の並びは元の順を保つ。
const CHUNK_SIZE = 100
const CHUNK_CONCURRENCY = 6
export async function fetchInChunks<T>(ids: string[], fetchChunk: (chunk: string[]) => Promise<T>): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) chunks.push(ids.slice(i, i + CHUNK_SIZE))
  const results: T[] = new Array(chunks.length)
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++
      results[index] = await fetchChunk(chunks[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker))
  return results
}
