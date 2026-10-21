// 同時の読み取りの共有（sharedRequest）が、利用者・組織の切替と保存の境界を越えないこと
// （Codex 独立レビュー #1211 f4abdc4 の P1・P2 の 4 ケース）
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/apiClient', () => ({ apiClient: mocks }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
})

describe('同時の読み取りの共有は、切替と保存をまたがない', () => {
  it('スタッフ一覧: 利用者が A から B に替わった後の呼び出しは、A の取得に相乗りせず新しく取る', async () => {
    const old = deferred<unknown[]>()
    mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ id: 'B-staff', organization_id: 'B' }])
    const { getAllStaffShared } = await import('@/lib/api/staffShared')
    const { noteAuthUser } = await import('@/lib/api/sharedRequest')
    noteAuthUser('user-A')
    const before = getAllStaffShared()
    noteAuthUser('user-B') // 認証の状態変化（src/lib/supabase.ts の onAuthStateChange から呼ばれる）
    const after = getAllStaffShared()
    old.resolve([{ id: 'A-staff', organization_id: 'A', email: 'synthetic@example.invalid' }])
    expect(await after).toEqual([{ id: 'B-staff', organization_id: 'B' }])
    expect(await before).toEqual([{ id: 'A-staff', organization_id: 'A', email: 'synthetic@example.invalid' }])
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('組織設定: 組織を切り替えた後の呼び出しは、切替前の取得に相乗りせず新しく取る', async () => {
    const old = deferred<unknown>()
    mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ organization_id: 'B' })
    const { organizationSettingsApi } = await import('@/lib/api/organizationSettingsApi')
    const { invalidateSharedRequests } = await import('@/lib/api/sharedRequest')
    const first = organizationSettingsApi.get()
    invalidateSharedRequests() // 組織の切替（MasterOrgSwitcher）
    const second = organizationSettingsApi.get()
    old.resolve({ organization_id: 'A' })
    expect(await second).toEqual({ organization_id: 'B' })
    expect(await first).toEqual({ organization_id: 'A' })
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('スタッフ一覧: 保存の後の呼び出しは、保存前に始まった取得に相乗りしない', async () => {
    const old = deferred<unknown[]>()
    mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ id: 'staff', name: 'new' }])
    mocks.patch.mockResolvedValue({ id: 'staff', name: 'new' })
    const { staffApi } = await import('@/lib/api/staffApi')
    const before = staffApi.getAll()
    await staffApi.update('staff', { name: 'new' } as never)
    const after = staffApi.getAll()
    old.resolve([{ id: 'staff', name: 'old' }])
    expect(await after).toEqual([{ id: 'staff', name: 'new' }])
    await before
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('組織設定: 保存の後の呼び出しは、保存前に始まった取得に相乗りしない', async () => {
    const old = deferred<unknown>()
    mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ organization_id: 'A', custom_holidays: ['new'] })
    mocks.patch.mockResolvedValue({ organization_id: 'A', custom_holidays: ['new'] })
    const { organizationSettingsApi } = await import('@/lib/api/organizationSettingsApi')
    const before = organizationSettingsApi.get()
    await organizationSettingsApi.upsert({ custom_holidays: ['new'] } as never)
    const after = organizationSettingsApi.get()
    old.resolve({ organization_id: 'A', custom_holidays: ['old'] })
    expect(await after).toMatchObject({ custom_holidays: ['new'] })
    await before
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('切替も保存もなければ、同時の呼び出しは 1 回の通信を共有し、終わったら次は取り直す', async () => {
    mocks.get.mockResolvedValueOnce([{ id: 's1' }]).mockResolvedValueOnce([{ id: 's2' }])
    const { getAllStaffShared } = await import('@/lib/api/staffShared')
    const [a, b] = await Promise.all([getAllStaffShared(), getAllStaffShared()])
    expect(a).toBe(b)
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(await getAllStaffShared()).toEqual([{ id: 's2' }])
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('取得が失敗しても共有は外れ、次の呼び出しは取り直す', async () => {
    mocks.get.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([{ id: 's' }])
    const { getAllStaffShared } = await import('@/lib/api/staffShared')
    await expect(getAllStaffShared()).rejects.toThrow('boom')
    expect(await getAllStaffShared()).toEqual([{ id: 's' }])
  })
})

describe('作品一覧の共有（公演の月データ取得）', () => {
  it('組織 A の作品一覧の取得中に組織 B へ切り替わったら、B の月データは B の作品一覧を新しく取る', async () => {
    const m = vi.hoisted(() => ({ month: vi.fn(), scenarios: vi.fn(), scope: 'A' }))
    vi.doMock('@/lib/api', () => ({ scheduleApi: { getByMonth: m.month }, scenarioApi: { getAll: m.scenarios } }))
    vi.doMock('@/lib/organization', () => ({ getCurrentOrganizationId: async () => m.scope }))
    vi.doMock('@/lib/api/scenarioAliasApi', () => ({ getScenarioAliases: async () => ({}) }))
    vi.doMock('@/lib/api/scheduleHookReadApi', () => ({
      scheduleEventsQueryReadApi: {
        listConfirmedPrivateWithoutEvent: async () => ({ data: [], error: null }),
        listNicknamesByReservationIds: async () => ({ data: [], error: null }),
        listStatusesByEventIds: async () => ({ data: [], error: null }),
      },
    }))
    m.scope = 'A'
    const old = deferred<unknown[]>()
    m.scenarios.mockReset().mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ id: 'scenario-B', title: 'Work', player_count_max: 8 }])
    m.month.mockReset().mockImplementation(async () => [{
      id: 'event-' + m.scope, date: '2026-11-01', store_id: 'store-' + m.scope, scenario: 'Work',
      gms: [], gm_roles: {}, category: 'open', start_time: '10:00', end_time: '14:00', capacity: 8,
    }])
    const { fetchScheduleEventsForMonth } = await import('@/hooks/useScheduleEventsQuery')
    const first = fetchScheduleEventsForMonth(2026, 11)
    m.scope = 'B'
    const second = fetchScheduleEventsForMonth(2026, 12)
    old.resolve([{ id: 'scenario-A', title: 'Work', player_count_max: 6 }])
    const result = await second
    await first
    expect(m.scenarios).toHaveBeenCalledTimes(2)
    expect(result[0]).toMatchObject({ id: 'event-B', scenarios: { id: 'scenario-B', player_count_max: 8 } })
  })
})
