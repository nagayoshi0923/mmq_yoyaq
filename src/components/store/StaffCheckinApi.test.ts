import { describe, expect, it, vi } from 'vitest'
import {
  createStaffCheckinService,
  getJstDayBounds,
  loadStaffCheckinContext,
  resolveStaffCheckinContext,
  resolveEventGmStaff,
  type StaffCheckinRepository,
} from '../../../api/store-dashboard'

const user = {
  userId: 'user-self',
  orgId: 'org-self',
  role: 'staff' as const,
  jwt: 'test-jwt',
}
const fixedNow = () => new Date('2026-08-03T15:30:00.000Z')

function createRepository(overrides: Partial<StaffCheckinRepository> = {}): StaffCheckinRepository {
  return {
    isStoreRepresentative: vi.fn().mockResolvedValue(true),
    findStaffIdsByUser: vi.fn().mockResolvedValue(['staff-self']),
    storeBelongsToOrganization: vi.fn().mockResolvedValue(true),
    findToday: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue({ id: 'checkin-new', checked_in_at: '2026-08-03T15:30:01.000Z' }),
    deleteToday: vi.fn().mockResolvedValue({ id: 'checkin-old', checked_in_at: '2026-08-03T04:30:00.000Z' }),
    ...overrides,
  }
}

describe('staff checkin API service', () => {
  it('実スキーマに存在するstaff列だけを読み、宛名を公演情報から独立して返す', async () => {
    const staffQuery = createSupabaseQuery({ data: [{ id: 'staff-self', name: 'ソラ' }], error: null })
    const eventQuery = createSupabaseQuery({ data: [{ start_time: '13:30:00', scenario: 'REDRUM05 目醒めゆくフローライト', gms: ['ソラ'], is_cancelled: false }], error: null })
    const storeQuery = createSupabaseQuery({ data: { id: 'store-selected', name: 'クインズワルツ高田馬場店' }, error: null })
    const database = { from: vi.fn((table: string) => ({ staff: staffQuery, schedule_events: eventQuery, stores: storeQuery })[table]) }

    await expect(loadStaffCheckinContext(database, user, 'store-selected')).resolves.toEqual({
      staff_name: 'ソラ',
      performance: {
        start_time: '13:30:00',
        scenario: 'REDRUM05 目醒めゆくフローライト',
        store_name: 'クインズワルツ高田馬場店',
      },
    })
    expect(staffQuery.select).toHaveBeenCalledWith('id, name')
  })

  it('公演情報の取得に失敗しても宛名行を保持する', async () => {
    const staffQuery = createSupabaseQuery({ data: [{ id: 'staff-self', name: 'ソラ' }], error: null })
    const eventQuery = createSupabaseQuery({ data: null, error: new Error('schedule unavailable') })
    const storeQuery = createSupabaseQuery({ data: { id: 'store-selected', name: 'クインズワルツ高田馬場店' }, error: null })
    const database = { from: vi.fn((table: string) => ({ staff: staffQuery, schedule_events: eventQuery, stores: storeQuery })[table]) }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(loadStaffCheckinContext(database, user, 'store-selected')).resolves.toEqual({ staff_name: 'ソラ' })
    consoleError.mockRestore()
  })

  it('表示名を優先して担当公演の補足情報を組み立てる', () => {
    expect(resolveStaffCheckinContext(
      { id: 'staff-self', name: '旧名', display_name: 'ソラ' },
      [
        { start_time: '13:30:00', scenario: 'REDRUM05 目醒めゆくフローライト', gms: ['ソラ'], is_cancelled: false },
      ],
      'クインズワルツ高田馬場店',
    )).toEqual({
      staff_name: 'ソラ',
      performance: {
        start_time: '13:30:00',
        scenario: 'REDRUM05 目醒めゆくフローライト',
        store_name: 'クインズワルツ高田馬場店',
      },
    })
  })

  it('担当名・公演情報の欠損や中止公演を例外なく省略する', () => {
    expect(resolveStaffCheckinContext(
      { id: 'staff-self', name: 'ソラ' },
      [{ start_time: '13:30:00', scenario: 'REDRUM05', gms: ['ソラ'], is_cancelled: true }],
      'クインズワルツ高田馬場店',
    )).toEqual({ staff_name: 'ソラ' })
    expect(resolveStaffCheckinContext(undefined, null, null)).toEqual({})
  })

  it('公演のGM名を正としてスタッフ照合に失敗しても表示用行を残す', () => {
    const staff = [{ id: 'staff-sora', name: 'ソラ', organization_id: 'org-self' }]

    expect(resolveEventGmStaff(['ソラ', '未登録GM', ''], staff, 'org-self', 'event-1')).toEqual([
      { id: 'staff-sora', name: 'ソラ', organization_id: 'org-self' },
      { id: 'event-gm:event-1:1', name: '未登録GM', display_name: '未登録GM', organization_id: 'org-self' },
    ])
  })

  it('JST当日の範囲を翌日0時未満で固定する', () => {
    expect(getJstDayBounds(fixedNow())).toEqual({
      start: '2026-08-04T00:00:00+09:00',
      end: '2026-08-05T00:00:00+09:00',
    })
  })

  it('usersの店舗代表フラグをDB確認しfail-closedにする', async () => {
    const service = createStaffCheckinService(createRepository({ isStoreRepresentative: vi.fn().mockResolvedValue(false) }), fixedNow)
    await expect(service.getState(user)).rejects.toMatchObject({ status: 403 })
  })

  it('ログインuserとorganizationから本人staffを一意解決する', async () => {
    const repository = createRepository()
    const service = createStaffCheckinService(repository, fixedNow)
    await service.getState(user)
    expect(repository.findStaffIdsByUser).toHaveBeenCalledWith('user-self', 'org-self')
    expect(repository.findToday).toHaveBeenCalledWith(
      { staffId: 'staff-self', organizationId: 'org-self' },
      '2026-08-04T00:00:00+09:00',
      '2026-08-05T00:00:00+09:00',
    )
  })

  it.each([
    { name: '本人staffがない', overrides: { findStaffIdsByUser: vi.fn().mockResolvedValue([]) } },
    { name: '本人staffが複数', overrides: { findStaffIdsByUser: vi.fn().mockResolvedValue(['staff-1', 'staff-2']) } },
    { name: '別organizationの店舗', overrides: { storeBelongsToOrganization: vi.fn().mockResolvedValue(false) } },
  ])('$name場合は打刻を拒否する', async ({ overrides }) => {
    const service = createStaffCheckinService(createRepository(overrides), fixedNow)
    await expect(service.checkIn(user, 'store-selected')).rejects.toMatchObject({ status: 403 })
  })

  it('作成値はserver解決したstaff/store/orgだけでDB DEFAULT NOW()へ時刻を委ねる', async () => {
    const repository = createRepository()
    const service = createStaffCheckinService(repository, fixedNow)
    await service.checkIn(user, 'store-selected')
    expect(repository.insert).toHaveBeenCalledWith({
      staff_id: 'staff-self',
      store_id: 'store-selected',
      organization_id: 'org-self',
    })
    expect(repository.insert).not.toHaveBeenCalledWith(expect.objectContaining({ checked_in_at: expect.anything() }))
  })

  it('当日の重複打刻はinsert前に409で拒否する', async () => {
    const repository = createRepository({ findToday: vi.fn().mockResolvedValue({ id: 'existing', checked_in_at: '2026-08-03T04:30:00.000Z' }) })
    const service = createStaffCheckinService(repository, fixedNow)
    await expect(service.checkIn(user, 'store-selected')).rejects.toMatchObject({ status: 409 })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('並行打刻でDB unique違反になった場合も409へ変換する', async () => {
    const repository = createRepository({ insert: vi.fn().mockRejectedValue({ code: '23505' }) })
    const service = createStaffCheckinService(repository, fixedNow)
    await expect(service.checkIn(user, 'store-selected')).rejects.toMatchObject({ status: 409 })
  })

  it('店舗切替後も選択店舗に縛らず本人・organization・JST当日の打刻を取得して取り消す', async () => {
    const existing = { id: 'checkin-at-other-store', checked_in_at: '2026-08-03T04:30:00.000Z' }
    const repository = createRepository({ findToday: vi.fn().mockResolvedValue(existing) })
    const service = createStaffCheckinService(repository, fixedNow)
    expect(await service.getState(user)).toEqual({ available: true, my_checkin: { checked_in_at: existing.checked_in_at } })
    await expect(service.cancel(user)).resolves.toEqual({ cancelled: true })
    expect(repository.deleteToday).toHaveBeenCalledWith(
      { staffId: 'staff-self', organizationId: 'org-self' },
      'checkin-at-other-store',
      '2026-08-04T00:00:00+09:00',
      '2026-08-05T00:00:00+09:00',
    )
  })

  it('当日の本人打刻がなければ取消を404にする', async () => {
    const service = createStaffCheckinService(createRepository(), fixedNow)
    await expect(service.cancel(user)).rejects.toMatchObject({ status: 404 })
  })
})

function createSupabaseQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}
