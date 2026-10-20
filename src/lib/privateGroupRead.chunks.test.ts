import { describe, expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('@/lib/privateGroupGuestSession', () => ({ getPrivateGroupGuestToken: () => null }))
import { readPrivateGroupList } from './privateGroupRead'

describe('readPrivateGroupList の指定ID読み込み（#837）', () => {
  it('指定した100件を取り切ったら、空の追加取得をしない', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `g-${String(i).padStart(3, '0')}`)
    rpc.mockImplementation(async (_name: string, args: { p_group_ids: string[] }) => ({
      data: args.p_group_ids.map(id => ({ id, created_at: '2026-10-01T00:00:00Z' })), error: null,
    }))
    const groups = await readPrivateGroupList('staff', 'org', ids)
    expect(groups).toHaveLength(250)
    expect(rpc).toHaveBeenCalledTimes(3)
  })
})

describe('readPrivateGroupList の先行表示（onPage）', () => {
  const serve = (total: number) => {
    const all = Array.from({ length: total }, (_, i) => ({ id: `g-${String(i).padStart(4, '0')}`, created_at: `2026-10-01T00:00:${String(i % 60).padStart(2, '0')}Z` }))
    rpc.mockReset()
    rpc.mockImplementation(async (_name: string, args: { p_after_id: string | null; p_limit: number }) => {
      const start = args.p_after_id ? all.findIndex(g => g.id === args.p_after_id) + 1 : 0
      return { data: all.slice(start, start + args.p_limit), error: null }
    })
  }
  it('100 件ずつ届くたびに、そこまでの分を渡す（最後の分は戻り値だけ）', async () => {
    serve(250)
    const seen: number[] = []
    const groups = await readPrivateGroupList('staff', 'org', undefined, loaded => seen.push(loaded.length))
    expect(seen).toEqual([100, 200])
    expect(groups).toHaveLength(250)
    expect(rpc).toHaveBeenCalledTimes(3)
  })
  it('ちょうど 200 件なら 100・200 を渡し、空の 3 ページ目で終える', async () => {
    serve(200)
    const seen: number[] = []
    const groups = await readPrivateGroupList('staff', 'org', undefined, loaded => seen.push(loaded.length))
    expect(seen).toEqual([100, 200])
    expect(groups).toHaveLength(200)
  })
  it('100 件未満なら途中経過は渡さない', async () => {
    serve(99)
    const onPage = vi.fn()
    expect(await readPrivateGroupList('staff', 'org', undefined, onPage)).toHaveLength(99)
    expect(onPage).not.toHaveBeenCalled()
  })
  it('途中経過も作成日の新しい順', async () => {
    serve(150)
    let first: Array<{ created_at: string; id: string }> = []
    await readPrivateGroupList('staff', 'org', undefined, loaded => { if (!first.length) first = loaded })
    const sorted = [...first].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
    expect(first.map(g => g.id)).toEqual(sorted.map(g => g.id))
  })
})
