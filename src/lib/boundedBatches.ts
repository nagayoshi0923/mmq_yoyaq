/** Bound request size and concurrency; reject rather than return a partial result. */
export async function boundedBatches<T, R>(items: T[], size: number, concurrency: number, read: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid batch bounds')
  const pages: R[][] = []
  let offset = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.ceil(items.length / size)) }, async () => {
    while (offset < items.length) {
      const start = offset
      offset += size
      pages[start / size] = await read(items.slice(start, start + size))
    }
  }))
  return pages.flat()
}
