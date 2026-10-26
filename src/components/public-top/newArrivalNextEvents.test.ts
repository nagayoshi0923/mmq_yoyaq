// 新作のカードの次回公演: 外れる公演が先にあっても有効な公演を 2 件まで読む（2026-10-26 社長報告）
import { describe, expect, it } from 'vitest'
import { collectNextValid, NEW_ARRIVAL_NEXT_MAX_ROWS } from './newArrivalNextEvents'

const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `ev${from + i}` }))

describe('新作のカードの次回公演を読む', () => {
  it('最初のページで 2 件そろえば、そこで止めて 2 件だけ返す', async () => {
    const calls: number[] = []
    const got = await collectNextValid(async (offset, limit) => { calls.push(offset); return { data: rows(limit, offset), error: null } }, (r) => r)
    expect(got.map((r) => r.id)).toEqual(['ev0', 'ev1'])
    expect(calls).toEqual([0])
  })
  it('外れる公演（募集停止・締切など）が先に続いても、次のページを読んで有効な公演を取りこぼさない', async () => {
    const calls: number[] = []
    const valid = new Set(['ev6', 'ev9'])
    const got = await collectNextValid(async (offset, limit) => { calls.push(offset); return { data: rows(limit, offset), error: null } }, (r) => r.filter((x) => valid.has(x.id)))
    expect(got.map((r) => r.id)).toEqual(['ev6', 'ev9'])
    expect(calls).toEqual([0, 4])
  })
  it('公演が尽きたら（ページが足りない）、1 件でもそのまま返す', async () => {
    const calls: number[] = []
    const got = await collectNextValid(async (offset) => { calls.push(offset); return { data: offset === 0 ? rows(4) : rows(1, 4), error: null } }, (r) => r.filter((x) => x.id === 'ev4'))
    expect(got.map((r) => r.id)).toEqual(['ev4'])
    expect(calls).toEqual([0, 4])
  })
  it('40 件が対象外で 41 件目・200 件目が有効でも、黙って空にせず読み進めて返す', async () => {
    const valid = new Set(['ev40', 'ev199'])
    const got = await collectNextValid(async (offset, limit) => ({ data: rows(limit, offset), error: null }), (r) => r.filter((x) => valid.has(x.id)))
    expect(got.map((r) => r.id)).toEqual(['ev40', 'ev199'])
  })
  it('対象外が実用上の上限まで続いたら、空と見せずに失敗にする', async () => {
    let read = 0
    await expect(collectNextValid(async (offset, limit) => { read = offset + limit; return { data: rows(limit, offset), error: null } }, () => [])).rejects.toThrow('有効な公演がそろいません')
    expect(read).toBeGreaterThanOrEqual(NEW_ARRIVAL_NEXT_MAX_ROWS)
    expect(read).toBeLessThan(NEW_ARRIVAL_NEXT_MAX_ROWS + 50)
  })
  it('読めなかったら失敗にする（空と見せない）', async () => {
    await expect(collectNextValid(async () => ({ data: null, error: { message: 'boom' } }), (r) => r)).rejects.toEqual({ message: 'boom' })
  })
})

import { beyondLoadedRange, nextEventsFromQueries } from './newArrivalNextEvents'
const q = (over: Partial<Parameters<typeof nextEventsFromQueries>[1][number]>) => ({ data: [{ id: 'ev', date: '2027-04-10' }], isError: false, isFetching: false, isFetchedAfterMount: true, status: 'success', fetchStatus: 'idle', dataUpdatedAt: 1, refetch: () => {}, ...over })

describe('点検 R1247: 次回公演の取得の状態', () => {
  it('再訪で今回の取得が終わるまでは、前回のキャッシュの公演（離れている間に取消され得る）を使わず「読み込み中」', () => {
    const r = nextEventsFromQueries(['s1'], [q({ isFetchedAfterMount: false, isFetching: true })])
    expect(r.events).toEqual([])
    expect(r.state.get('s1')).toBe('loading')
  })
  it('読めなかったら「公演なし」ではなく error（古いキャッシュの公演も使わない）。再試行中は「読み込み中」', () => {
    expect(nextEventsFromQueries(['s1'], [q({ isError: true, status: 'error' })])).toEqual({ events: [], state: new Map([['s1', 'error']]) })
    expect(nextEventsFromQueries(['s1'], [q({ isError: true, status: 'error', isFetching: true })]).state.get('s1')).toBe('loading')
  })
  it('今回読めたら公演を使い ready（0 件でも ready）', () => {
    expect(nextEventsFromQueries(['s1', 's2'], [q({}), q({ data: [] })])).toEqual({ events: [{ id: 'ev', date: '2027-04-10' }], state: new Map([['s1', 'ready'], ['s2', 'ready']]) })
  })
  it('最初の取得の期間の中は最初の取得を正とし、次回公演の取得からは足さない', () => {
    const ev = [{ id: 'a', date: '2026-12-31' }, { id: 'b', date: '2027-01-01' }]
    expect(beyondLoadedRange(ev, '2026-12-31').map((e) => e.id)).toEqual(['b'])
    expect(beyondLoadedRange(ev, null).map((e) => e.id)).toEqual(['a', 'b'])
  })
})
