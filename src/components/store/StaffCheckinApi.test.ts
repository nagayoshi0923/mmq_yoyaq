import { describe, expect, it, vi } from 'vitest'
import {
  createStaffCheckinService,
  getJstDayBounds,
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
