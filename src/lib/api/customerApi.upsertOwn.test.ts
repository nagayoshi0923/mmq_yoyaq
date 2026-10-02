import { beforeEach, describe, expect, it, vi } from 'vitest'

// supabase のチェーン（select/eq/maybeSingle、update/eq、insert/select/single）を記録するモック
const m = vi.hoisted(() => {
  const calls: Array<[string, unknown?]> = []
  const state = { existing: null as null | { id: string }, updateError: null as unknown, insertResult: { data: { id: 'new-id' }, error: null } as { data: { id: string } | null; error: unknown } }
  const chain = (op: string) => {
    const q: Record<string, unknown> = {}
    const wrap = (name: string) => (...args: unknown[]) => { calls.push([`${op}.${name}`, args]); return q }
    for (const name of ['select', 'eq']) q[name] = wrap(name)
    q.maybeSingle = async () => ({ data: state.existing, error: null })
    q.single = async () => state.insertResult
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: state.updateError }).then(resolve)
    return q
  }
  const from = vi.fn(() => ({
    select: (...a: unknown[]) => { calls.push(['find.select', a]); return chain('find') },
    update: (...a: unknown[]) => { calls.push(['update.values', a]); return chain('update') },
    insert: (...a: unknown[]) => { calls.push(['insert.values', a]); return chain('insert') },
  }))
  return { calls, state, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: {} }))
import { upsertOwnCustomer } from './customerApi'

const base = { userId: 'u1', name: '太郎', nickname: null, phone: '09000000000', email: 'a@example.invalid', organizationId: 'org1' }
beforeEach(() => { m.calls.length = 0; m.state.existing = null; m.state.updateError = null; m.state.insertResult = { data: { id: 'new-id' }, error: null } })

describe('upsertOwnCustomer（予約・貸切申込・キャンセル待ちの顧客行）', () => {
  it('既存行があれば自分の行だけを更新して id を返す（organization_id は書き換えない）', async () => {
    m.state.existing = { id: 'c1' }
    expect(await upsertOwnCustomer(base)).toBe('c1')
    const upd = m.calls.find(c => c[0] === 'update.values')![1] as unknown[]
    expect(upd[0]).toEqual({ name: '太郎', nickname: null, phone: '09000000000', email: 'a@example.invalid' })
    expect(m.calls.filter(c => c[0] === 'update.eq').map(c => c[1])).toEqual([['id', 'c1'], ['user_id', 'u1']])
    expect(m.calls.some(c => c[0] === 'insert.values')).toBe(false)
  })
  it('既存行が無ければ作成して新しい id を返す', async () => {
    expect(await upsertOwnCustomer(base)).toBe('new-id')
    expect((m.calls.find(c => c[0] === 'insert.values')![1] as unknown[])[0]).toEqual({ user_id: 'u1', name: '太郎', nickname: null, phone: '09000000000', email: 'a@example.invalid', organization_id: 'org1' })
  })
  it('通常は更新・作成の失敗を投げず、作成に失敗したら null（呼び出し側が従来どおりエラー化）', async () => {
    m.state.insertResult = { data: null, error: { message: 'x' } }
    expect(await upsertOwnCustomer(base)).toBeNull()
    m.state.existing = { id: 'c1' }; m.state.updateError = { message: 'x' }
    expect(await upsertOwnCustomer(base)).toBe('c1')
  })
  it('nickname を省略したときは、更新にも作成にも nickname 列を含めない（貸切グループの申込）', async () => {
    const { nickname: _omit, ...noNickname } = base
    m.state.existing = { id: 'c1' }
    await upsertOwnCustomer(noNickname)
    expect((m.calls.find(c => c[0] === 'update.values')![1] as unknown[])[0]).toEqual({ name: '太郎', phone: '09000000000', email: 'a@example.invalid' })
    m.calls.length = 0; m.state.existing = null
    await upsertOwnCustomer({ ...noNickname, organizationId: null })
    expect((m.calls.find(c => c[0] === 'insert.values')![1] as unknown[])[0]).toEqual({ user_id: 'u1', name: '太郎', phone: '09000000000', email: 'a@example.invalid', organization_id: null })
  })
  it('キャンセル待ち登録（scopeByOrganization + throwOnError）は組織でも絞り、失敗を投げる', async () => {
    m.state.existing = { id: 'c1' }
    await upsertOwnCustomer({ ...base, scopeByOrganization: true, throwOnError: true })
    expect(m.calls.filter(c => c[0] === 'find.eq').map(c => c[1])).toEqual([['user_id', 'u1'], ['organization_id', 'org1']])
    expect(m.calls.filter(c => c[0] === 'update.eq').map(c => c[1])).toEqual([['id', 'c1'], ['user_id', 'u1'], ['organization_id', 'org1']])
    m.state.updateError = new Error('upd')
    await expect(upsertOwnCustomer({ ...base, scopeByOrganization: true, throwOnError: true })).rejects.toThrow('upd')
    m.state.existing = null; m.state.insertResult = { data: null, error: new Error('ins') }
    await expect(upsertOwnCustomer({ ...base, scopeByOrganization: true, throwOnError: true })).rejects.toThrow('ins')
  })
})
