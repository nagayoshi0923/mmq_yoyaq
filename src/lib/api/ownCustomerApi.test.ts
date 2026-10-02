import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    for (const name of ['eq', 'select', 'single']) q[name] = (...a: unknown[]) => { calls.push([name, a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'c1' }], error: null }).then(resolve)
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
import { ownCustomerApi } from './customerApi'

beforeEach(() => { m.calls.length = 0 })
const arg = (name: string) => m.calls.filter(c => c[0] === name).map(c => c[1])
const fields = { name: '太郎', nickname: null, phone: '090', address: null, line_id: null, email: 'a@example.invalid' }

describe('ownCustomerApi（本人の顧客行の書き込み）', () => {
  it('プロフィール更新は id で絞り、userId を渡したときは user_id でも絞り、updated_at を付けて id を返す', async () => {
    await ownCustomerApi.updateProfileById('c1', fields, 'u1')
    expect(m.calls[0]).toEqual(['from', ['customers']])
    const [values] = arg('update')[0] as [Record<string, unknown>]
    expect(values).toMatchObject(fields); expect(typeof values.updated_at).toBe('string')
    expect(arg('eq')).toEqual([['id', 'c1'], ['user_id', 'u1']]); expect(arg('select')).toEqual([['id']])
  })
  it('userId が無いときは id だけで絞る（匿名はメールでの旧挙動）', async () => {
    await ownCustomerApi.updateProfileById('c1', fields, undefined)
    expect(arg('eq')).toEqual([['id', 'c1']])
  })
  it('初回の作成は user_id と組織つきで入れて id を返す', async () => {
    await ownCustomerApi.insertProfile('u1', fields, 'org1')
    expect(arg('insert')[0]).toEqual([{ user_id: 'u1', ...fields, organization_id: 'org1' }]); expect(arg('select')).toEqual([['id']])
  })
  it('通知設定・アバター・user_id の紐付けは、それぞれ決まった列だけを決まった条件で更新する', async () => {
    await ownCustomerApi.updateNotificationSettings('c1', { a: true })
    expect(arg('update')[0]).toEqual([{ notification_settings: { a: true } }]); expect(arg('eq')).toEqual([['id', 'c1']])
    m.calls.length = 0
    await ownCustomerApi.updateAvatarByEmail('a@example.invalid', 'https://x/y.png')
    expect(arg('update')[0]).toEqual([{ avatar_url: 'https://x/y.png' }]); expect(arg('eq')).toEqual([['email', 'a@example.invalid']])
    m.calls.length = 0
    await ownCustomerApi.linkUserId('c1', 'u1')
    expect(arg('update')[0]).toEqual([{ user_id: 'u1' }]); expect(arg('eq')).toEqual([['id', 'c1']])
  })
  it('お気に入り用の作成は組織つきで1件作り、id を1件返す', async () => {
    await ownCustomerApi.insertForFavorites({ email: 'a@example.invalid', name: 'a', user_id: 'u1', organization_id: 'org1' })
    expect(arg('insert')[0]).toEqual([{ email: 'a@example.invalid', name: 'a', user_id: 'u1', organization_id: 'org1' }]); expect(arg('single')).toHaveLength(1)
  })
})
