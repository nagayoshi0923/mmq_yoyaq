import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    for (const name of ['eq', 'is']) q[name] = (...a: unknown[]) => { calls.push([name, a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      update: (...a: unknown[]) => { calls.push(['update', a]); return make() },
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
    }
  })
  return { calls, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: {} }))
import { profileRegistrationApi } from './customerApi'

beforeEach(() => { m.calls.length = 0 })
const arg = (name: string) => m.calls.filter(c => c[0] === name).map(c => c[1])
const payload = { name: '太郎', email: 'a@example.invalid', organization_id: null }

describe('profileRegistrationApi（初回プロフィール登録の顧客行）', () => {
  it('自分の既存行の更新は id と user_id の両方で絞る（他人の行は触らない）', async () => {
    await profileRegistrationApi.updateOwnRow('c1', 'u1', payload)
    expect(m.calls[0]).toEqual(['from', ['customers']]); expect(arg('update')[0]).toEqual([payload]); expect(arg('eq')).toEqual([['id', 'c1'], ['user_id', 'u1']])
  })
  it('新規作成は渡した行をそのまま入れる', async () => {
    await profileRegistrationApi.insertOwnRow({ ...payload, user_id: 'u1' })
    expect(arg('insert')[0]).toEqual([{ ...payload, user_id: 'u1' }])
  })
  it('同メールの未紐付け顧客への紐付けは user_id が NULL の行だけを、自分の user_id とプロフィールで更新する', async () => {
    await profileRegistrationApi.linkToEmailCustomer('c9', 'u1', payload)
    expect(arg('update')[0]).toEqual([{ user_id: 'u1', ...payload }]); expect(arg('eq')).toEqual([['id', 'c9']]); expect(arg('is')).toEqual([['user_id', null]])
  })
})
