/** URL長とPostgRESTのmax_rowsを越えない単位で関連情報を読む。部分成功は返さない。 */
export async function fetchBatchedIds<T>(ids: string[], fetch: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const data: T[] = []
  const unique = [...new Set(ids)]
  for (let offset = 0; offset < unique.length; offset += 100) {
    const result = await fetch(unique.slice(offset, offset + 100))
    if (result.error) throw result.error
    data.push(...(result.data ?? []))
  }
  return { data, error: null }
}
