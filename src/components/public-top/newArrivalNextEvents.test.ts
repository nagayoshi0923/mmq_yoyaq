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

import { newArrivalPerformances, nextEventsFromQueries } from './newArrivalNextEvents'
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
})

describe('点検 R1247-A: 新作のカードは再訪で取り直した情報だけを使う', () => {
  const ids = (list: Array<{ id: string }>) => list.map((p) => p.id)
  it('店舗・全体: 「もっと見る」（?more=）で読み足した月の古い公演（4/10 は離れている間に取消）を、次回公演の取得が空でも出さない', () => {
    // base は最初の取得（〜12/31）＋読み足した月（再訪で取り直さない）。4/10 は読み足した月の古い行
    const base = [{ id: 'ev-1120', date: '2026-11-20' }, { id: 'ev-0410', date: '2027-04-10' }]
    expect(ids(newArrivalPerformances({ base, baseFresh: true, loadedUntil: '2026-12-31', next: [] }))).toEqual(['ev-1120'])
  })
  it('全体: 最初の 55 日が再訪で取り直されていない（古い）ときは、その中の古い公演も使わず、次回公演の取得（今回取り直したもの）だけ', () => {
    const staleBase = [{ id: 'ev-cancelled-1105', date: '2026-11-05' }]
    const next = [{ id: 'ev-1110', date: '2026-11-10' }]
    expect(ids(newArrivalPerformances({ base: staleBase, baseFresh: false, loadedUntil: '2026-12-20', next }))).toEqual(['ev-1110'])
  })
  it('最初の取得を今回取り直せたら、その期間は最初の取得を正とし（次回公演の取得の同じ期間の行は足さない）、先は次回公演の取得から', () => {
    const base = [{ id: 'a', date: '2026-11-20' }]
    const next = [{ id: 'old-in-range', date: '2026-12-01' }, { id: 'b', date: '2027-02-07' }]
    expect(ids(newArrivalPerformances({ base, baseFresh: true, loadedUntil: '2026-12-31', next }))).toEqual(['a', 'b'])
  })
})
