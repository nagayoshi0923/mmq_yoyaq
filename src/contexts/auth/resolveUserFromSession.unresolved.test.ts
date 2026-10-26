// 2026-10-26 本番ログイン障害: ロール取得が 2 秒で打ち切られたあと、staff の確認が無応答だと利用者情報の確定が止まっていた
// （調査担当の再現: 60 秒後も setUser なし・処理中のまま）。staff の確認にも期限をつけ、分からないときは役割を決め打ちせず
// 未確定（unresolved）で返し、処理中を解除する（ログイン画面の再読み込みで確かめ直せる）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ role: vi.fn(), byId: vi.fn(), byEmail: vi.fn(), staffName: vi.fn() }))
vi.mock('@/lib/api/authSessionApi', () => ({ authSessionApi: {
  getUserRole: mocks.role, findStaffIdByUserId: mocks.byId, findStaffIdByEmail: mocks.byEmail,
  findStaffNameByUserId: mocks.staffName, findCustomerNameByUserId: vi.fn(async () => ({ data: null })), findUnlinkedCustomerByEmail: vi.fn(async () => ({ data: null })),
} }))
import { resolveUserFromSession } from './resolveUserFromSession'

const never = () => new Promise(() => {})
const deps = () => ({ isProcessingRef: { current: false }, userRef: { current: null as never }, staffCache: new Map<string, string>(), setStaffCache: vi.fn(), setUser: vi.fn() })
const user = { id: 'fake-user', email: 'qa@example.invalid', user_metadata: {} } as never
beforeEach(() => {
  vi.useFakeTimers()
  mocks.role.mockReset().mockImplementation(never)
  mocks.byId.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.byEmail.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.staffName.mockReset().mockResolvedValue({ data: null })
})
afterEach(() => vi.useRealTimers())

describe('ロール取得の期限切れのあとの staff の確認', () => {
  it('staff の確認も無応答なら、期限（3 秒）で未確定を返し、役割を決め打ちせず処理中を解除する', async () => {
    mocks.byId.mockImplementation(never)
    const d = deps()
    let result: string | undefined
    void resolveUserFromSession(user, d).then((r) => { result = r })
    await vi.advanceTimersByTimeAsync(5_100)
    expect(result).toBe('unresolved')
    expect(d.isProcessingRef.current).toBe(false)
    expect(d.setUser).not.toHaveBeenCalled()
  })
  it('staff の確認が失敗（エラー）でも、お客様と決め打ちせず未確定', async () => {
    mocks.byId.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const d = deps()
    const p = resolveUserFromSession(user, d)
    await vi.advanceTimersByTimeAsync(2_100)
    expect(await p).toBe('unresolved')
    expect(d.setUser).not.toHaveBeenCalled()
  })
  it('staff に一致しなくても、ロールを読めていないのでお客様と決めず未確定（管理者に staff 行が無い場合など）', async () => {
    const d = deps()
    const p = resolveUserFromSession(user, d)
    await vi.advanceTimersByTimeAsync(2_100)
    expect(await p).toBe('unresolved')
    expect(d.setUser).not.toHaveBeenCalled()
    expect(d.isProcessingRef.current).toBe(false)
  })
  it('同じ利用者の既知の役割があれば、ロールを読めなくても保持する（従来どおり）', async () => {
    const d = deps()
    d.userRef.current = { id: 'fake-user', email: 'qa@example.invalid', name: 'qa', role: 'license_admin', isStoreRepresentative: false } as never
    const p = resolveUserFromSession(user, d)
    await vi.advanceTimersByTimeAsync(2_100)
    expect(await p).toBe('resolved')
    expect(d.setUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'license_admin' }))
  })
  it('staff に一致すればスタッフとして確定', async () => {
    mocks.byId.mockResolvedValue({ data: { id: 's1' }, error: null })
    const d = deps()
    const p = resolveUserFromSession(user, d)
    await vi.advanceTimersByTimeAsync(2_100)
    expect(await p).toBe('resolved')
    expect(d.setUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'staff' }))
  })
  it('未確定のあと、確かめ直し（再読み込み）でロールが取れれば本来の役割で確定する', async () => {
    mocks.byId.mockImplementation(never)
    const d = deps()
    const first = resolveUserFromSession(user, d)
    await vi.advanceTimersByTimeAsync(5_100)
    expect(await first).toBe('unresolved')
    mocks.role.mockResolvedValue({ data: { role: 'admin', is_store_representative: false }, error: null })
    expect(await resolveUserFromSession(user, d)).toBe('resolved')
    expect(d.setUser).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'admin' }))
  })
})
