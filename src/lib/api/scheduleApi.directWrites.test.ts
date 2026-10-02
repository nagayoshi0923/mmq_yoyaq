import { beforeEach, describe, expect, it, vi } from 'vitest'

// supabase のチェーン（from → 操作 → 条件）を記録するモック
const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    for (const name of ['eq', 'in', 'select']) q[name] = (...a: unknown[]) => { calls.push([name, a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
      update: (...a: unknown[]) => { calls.push(['update', a]); return make() },
      delete: () => { calls.push(['delete', []]); return make() },
    }
  })
  return { calls, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: {} }))
import { scheduleApi } from './scheduleApi'

beforeEach(() => { m.calls.length = 0 })
const names = () => m.calls.map(c => c[0])
const arg = (name: string) => m.calls.filter(c => c[0] === name).map(c => c[1])

describe('scheduleApi の直接書き込み（取り込み・一括処理用）', () => {
  it('insertMany は schedule_events に複数行を入れて id を返す', async () => {
    await scheduleApi.insertMany([{ a: 1 }, { a: 2 }])
    expect(m.calls[0]).toEqual(['from', ['schedule_events']]); expect(m.calls[1]).toEqual(['insert', [[{ a: 1 }, { a: 2 }]]]); expect(arg('select')).toEqual([['id']])
  })
  it('updateFields は id で絞って更新する', async () => {
    await scheduleApi.updateFields('e1', { notes: 'x' })
    expect(m.calls[1]).toEqual(['update', [{ notes: 'x' }]]); expect(arg('eq')).toEqual([['id', 'e1']])
  })
  it('deleteManyByIds は id の一覧で削除する', async () => {
    await scheduleApi.deleteManyByIds(['a', 'b'])
    expect(names().slice(0, 3)).toEqual(['from', 'delete', 'in']); expect(arg('in')).toEqual([['id', ['a', 'b']]])
  })
  it('relinkScenarioByTitle は同じシナリオ名の公演を、タイトルとマスタ ID で更新する', async () => {
    await scheduleApi.relinkScenarioByTitle('旧名', { title: '新名', id: 'm1' })
    expect(m.calls[1]).toEqual(['update', [{ scenario: '新名', scenario_master_id: 'm1' }]]); expect(arg('eq')).toEqual([['scenario', '旧名']])
  })
  it('deleteWithResult は組織を渡したときだけ組織でも絞り、削除された行を返させる', async () => {
    await scheduleApi.deleteWithResult('e1', 'o1')
    expect(arg('eq')).toEqual([['id', 'e1'], ['organization_id', 'o1']]); expect(arg('select')).toEqual([['id']])
    m.calls.length = 0
    await scheduleApi.deleteWithResult('e1', null)
    expect(arg('eq')).toEqual([['id', 'e1']])
  })
})
