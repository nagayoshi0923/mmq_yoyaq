// 店舗トップの公演の取得: 1000 件ずつ最後まで読む・順番を固定・途中で失敗したら読めた行と error（2026-10-25 月送り・もっと見る）
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ total: 0, failPage: -1 as number, calls: [] as Array<[string, ...unknown[]]>, latest: null as string | null }))
vi.mock('@/lib/supabase', () => {
  const make = () => {
    const state: { range?: [number, number]; limit?: number } = {}
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'not', 'order']) b[m] = (...args: unknown[]) => { db.calls.push([m, ...args]); return b }
    b.range = (from: number, to: number) => { db.calls.push(['range', from, to]); state.range = [from, to]; return b }
    b.limit = (n: number) => { db.calls.push(['limit', n]); state.limit = n; return b }
    b.then = (resolve: (v: unknown) => unknown) => {
      if (state.limit) return Promise.resolve({ data: db.latest ? [{ date: db.latest }] : [], error: null }).then(resolve)
      const [from, to] = state.range ?? [0, 999]
      if (db.failPage === Math.floor(from / 1000)) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve)
      const rows = Array.from({ length: Math.max(0, Math.min(db.total, to + 1) - from) }, (_, i) => ({ id: `e${String(from + i).padStart(5, '0')}`, date: '2026-11-01' }))
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    }
    return b
  }
  return { supabase: { from: (t: string) => { db.calls.push(['from', t]); return make() } } }
})
import { publicBookingListReadApi } from './publicBookingReadApi'

beforeEach(() => { db.calls.length = 0; db.failPage = -1; db.total = 0; db.latest = null })

describe('期間内の公演（店舗トップ）', () => {
  it('1000 件を超えても最後まで読む（2500 件 → 3 回。ページの境目で重ならない・抜けない）', async () => {
    db.total = 2500
    const { data, error } = await publicBookingListReadApi.listPublicEventsInRange('2026-10-25', '2027-02-28', 'org-1')
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(new Set(data.map((r) => r.id)).size).toBe(2500)
    expect(db.calls.filter((c) => c[0] === 'range')).toEqual([['range', 0, 999], ['range', 1000, 1999], ['range', 2000, 2999]])
  })
  it('ちょうど 1000 件なら、次のページ（0 件）を確かめて終わる', async () => {
    db.total = 1000
    const { data } = await publicBookingListReadApi.listPublicEventsInRange('2026-10-25', '2026-12-31', 'org-1')
    expect(data).toHaveLength(1000)
    expect(db.calls.filter((c) => c[0] === 'range')).toHaveLength(2)
  })
  it('並びは 日付 → 開始 → id で固定（同じ日・同じ時刻でもページの境目で入れ替わらない）。組織で絞る', async () => {
    db.total = 10
    await publicBookingListReadApi.listPublicEventsInRange('2026-10-25', '2026-12-31', 'org-1')
    expect(db.calls.filter((c) => c[0] === 'order').map((c) => c[1])).toEqual(['date', 'start_time', 'id'])
    expect(db.calls).toContainEqual(['eq', 'organization_id', 'org-1'])
    expect(db.calls).toContainEqual(['eq', 'is_cancelled', false])
  })
  it('2 ページ目（1000 件目以降）で失敗したら、読めた行と error を返す（呼び出し側は読めなかった期間として扱う）', async () => {
    db.total = 2500; db.failPage = 1
    const { data, error } = await publicBookingListReadApi.listPublicEventsInRange('2026-10-25', '2027-02-28', 'org-1')
    expect(error).toEqual({ message: 'boom' })
    expect(data).toHaveLength(1000)
  })
})

describe('予約を受け付けている公開の公演のいちばん先の日', () => {
  it('公開・受付中・貸切でないオープン／出張から、日付の新しい順に 1 件', async () => {
    db.latest = '2027-02-07'
    const r = await publicBookingListReadApi.latestPublicOpenEventDate('org-1', '2026-10-25')
    expect(r).toEqual({ date: '2027-02-07', error: null })
    expect(db.calls).toContainEqual(['in', 'category', ['open', 'offsite']])
    expect(db.calls).toContainEqual(['not', 'published', 'is', false])
    expect(db.calls).toContainEqual(['not', 'is_reservation_enabled', 'is', false])
    expect(db.calls).toContainEqual(['not', 'is_private_booking', 'is', true])
    expect(db.calls).toContainEqual(['order', 'date', { ascending: false }])
    expect(db.calls).toContainEqual(['limit', 1])
  })
  it('無ければ null', async () => {
    expect(await publicBookingListReadApi.latestPublicOpenEventDate(null, '2026-10-25')).toEqual({ date: null, error: null })
  })
})
