/** 呼び出し側は一意キーを含む安定順で取得する。途中失敗は部分一覧にしない。 */
export async function fetchBookingRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

/** IN句のURL長と、関連行が1ページを超える場合の両方を扱う。 */
export async function fetchBookingRelatedRows<T>(
  ids: string[],
  page: (batch: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: null }> {
  const uniqueIds = [...new Set(ids)]
  const data: T[] = []
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const batch = uniqueIds.slice(offset, offset + 100)
    data.push(...await fetchBookingRows((from, to) => page(batch, from, to)))
  }
  return { data, error: null }
}
