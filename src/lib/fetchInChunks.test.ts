import { describe, expect, it } from 'vitest'
import { fetchInChunks } from './fetchInChunks'

describe('fetchInChunks（#835 貸切予約管理の読み込み）', () => {
  it('100件ずつに分け、元の順で結果を返す', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const seen: number[] = []
    const result = await fetchInChunks(ids, async chunk => {
      seen.push(chunk.length)
      await new Promise(resolve => setTimeout(resolve, chunk.length === 50 ? 0 : 5))
      return chunk[0]
    })
    expect(result).toEqual(['id-0', 'id-100', 'id-200'])
    expect(seen.sort()).toEqual([100, 100, 50].sort())
  })

  it('同時に取りに行く数は6件まで', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `id-${i}`)
    let running = 0
    let peak = 0
    await fetchInChunks(ids, async () => {
      running++; peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, 2))
      running--
    })
    expect(peak).toBe(6)
  })

  it('0件なら取りに行かない', async () => {
    let calls = 0
    expect(await fetchInChunks([], async () => { calls++ })).toEqual([])
    expect(calls).toBe(0)
  })

  it('途中の失敗はそのまま伝える', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`)
    await expect(fetchInChunks(ids, async chunk => { if (chunk[0] === 'id-100') throw new Error('取得失敗'); return 1 })).rejects.toThrow('取得失敗')
  })
})

describe('fetchInChunks の追加の決まり（#837）', () => {
  it('失敗したら、まだ始めていない分は取りに行かない', async () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `id-${i}`)
    const started: string[] = []
    await expect(fetchInChunks(ids, async chunk => {
      started.push(chunk[0])
      if (chunk[0] === 'id-0') throw new Error('取得失敗')
      await new Promise(resolve => setTimeout(resolve, 5))
      return 1
    })).rejects.toThrow('取得失敗')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(started.length).toBeLessThanOrEqual(6)
  })

  it('同時に呼んでも、画面全体で同時に動く取得は6件まで', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `id-${i}`)
    let running = 0
    let peak = 0
    const fetchChunk = async () => {
      running++; peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, 2))
      running--
    }
    await Promise.all([fetchInChunks(ids, fetchChunk), fetchInChunks(ids, fetchChunk)])
    expect(peak).toBe(6)
  })
})
