import { describe, expect, it, vi } from 'vitest'
import {
  createStaffCheckinService,
  getJstDayBounds,
  resolveStaffCheckinCandidates,
  type StaffCheckinRepository,
  type StaffCheckinScheduledCandidate,
} from '../../../api/store-dashboard'

const user = {
  userId: 'store-account',
  orgId: 'org-self',
  role: 'staff' as const,
  jwt: 'test-jwt',
}
const fixedNow = () => new Date('2026-08-03T15:30:00.000Z')

const sora = { id: 'staff-sora', name: 'ソラ', organization_id: 'org-self' }
const rena = { id: 'staff-rena', name: 'レナ', organization_id: 'org-self' }

function createRepository(overrides: Partial<StaffCheckinRepository> = {}): StaffCheckinRepository {
  return {
    isStoreRepresentative: vi.fn().mockResolvedValue(true),
    storeBelongsToOrganization: vi.fn().mockResolvedValue(true),
    findScheduledCandidates: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue({ id: 'checkin-new', checked_in_at: '2026-08-03T06:30:01.000Z' }),
    deleteToday: vi.fn().mockResolvedValue({ id: 'checkin-old', checked_in_at: '2026-08-03T06:30:00.000Z' }),
    ...overrides,
  }
}

function candidate(staff: typeof sora, checkin: StaffCheckinScheduledCandidate['checkin'] = null): StaffCheckinScheduledCandidate {
  return {
    staff,
    checkin,
    performance: {
      start_time: '13:30:00',
      scenario: 'REDRUM05 目醒めゆくフローライト',
      store_name: 'クインズワルツ高田馬場店',
    },
  }
}

describe('staff checkin API service', () => {
  it('スケジュールのGM割当を正として、未打刻GMを公演開始時刻順に選ぶ', () => {
    expect(resolveStaffCheckinCandidates(
      [sora, rena],
      [
        { start_time: '13:30:00', scenario: 'REDRUM05 目醒めゆくフローライト', gms: ['ソラ'], is_cancelled: false },
        { start_time: '18:00:00', scenario: '別シナリオ', gms: ['レナ'], is_cancelled: false },
      ],
      [{ id: 'checkin-sora', staff_id: 'staff-sora', checked_in_at: '2026-08-03T04:30:00.000Z' }],
      'クインズワルツ高田馬場店',
    )).toEqual([
      {
        staff: sora,
        performance: {
          start_time: '13:30:00',
          scenario: 'REDRUM05 目醒めゆくフローライト',
          store_name: 'クインズワルツ高田馬場店',
        },
        checkin: { id: 'checkin-sora', checked_in_at: '2026-08-03T04:30:00.000Z' },
      },
      {
        staff: rena,
        performance: { start_time: '18:00:00', scenario: '別シナリオ', store_name: 'クインズワルツ高田馬場店' },
        checkin: null,
      },
    ])
  })

  it('中止公演・割当名欠損・重複公演を安全に除外する', () => {
    expect(resolveStaffCheckinCandidates(
      [sora],
      [
        { start_time: '09:00:00', scenario: '中止', gms: ['ソラ'], is_cancelled: true },
        { start_time: '13:30:00', scenario: 'REDRUM05', gms: ['ソラ', '', null], is_cancelled: false },
        { start_time: '18:00:00', scenario: '別公演', gms: ['ソラ'], status: 'cancelled' },
      ],
      null,
      null,
    )).toEqual([{ staff: sora, performance: undefined, checkin: null }])
    expect(resolveStaffCheckinCandidates([sora], null, null, null)).toEqual([])
  })

  it('当日店舗の未打刻GMを宛名にして、公演情報も返す', async () => {
    const repository = createRepository({
      findScheduledCandidates: vi.fn().mockResolvedValue([candidate(sora)]),
    })
    const service = createStaffCheckinService(repository, fixedNow)

    await expect(service.getState(user, 'store-selected')).resolves.toEqual({
      available: true,
      my_checkin: null,
      staff_name: 'ソラ',
      performance: {
        start_time: '13:30:00',
        scenario: 'REDRUM05 目醒めゆくフローライト',
        store_name: 'クインズワルツ高田馬場店',
      },
    })
    expect(repository.findScheduledCandidates).toHaveBeenCalledWith(
      'org-self',
      'store-selected',
      '2026-08-04',
      '2026-08-04T00:00:00+09:00',
      '2026-08-05T00:00:00+09:00',
    )
  })

  it('打刻時にもサーバー側で未打刻GMを再選定し、そのstaff_idで記録する', async () => {
    const repository = createRepository({
      findScheduledCandidates: vi.fn().mockResolvedValue([candidate(sora, { id: 'already', checked_in_at: '2026-08-03T04:30:00.000Z' }), candidate(rena)]),
    })
    const service = createStaffCheckinService(repository, fixedNow)

    await service.checkIn(user, 'store-selected')

    expect(repository.insert).toHaveBeenCalledWith({
      staff_id: 'staff-rena',
      store_id: 'store-selected',
      organization_id: 'org-self',
    })
    expect(repository.insert).not.toHaveBeenCalledWith(expect.objectContaining({ checked_in_at: expect.anything() }))
  })

  it('当日の担当GMがいなければ打刻バブルを利用不可にする', async () => {
    const service = createStaffCheckinService(createRepository(), fixedNow)
    await expect(service.getState(user, 'store-selected')).resolves.toEqual({ available: false })
  })

  it('店舗代表でないアカウントは従来どおり拒否する', async () => {
    const service = createStaffCheckinService(createRepository({ isStoreRepresentative: vi.fn().mockResolvedValue(false) }), fixedNow)
    await expect(service.getState(user, 'store-selected')).rejects.toMatchObject({ status: 403 })
  })

  it('全員打刻済みのときは先頭GMの打刻状態を表示し、取消もそのGMに限定する', async () => {
    const existing = { id: 'checkin-sora', checked_in_at: '2026-08-03T04:30:00.000Z' }
    const repository = createRepository({
      findScheduledCandidates: vi.fn().mockResolvedValue([candidate(sora, existing), candidate(rena, { id: 'checkin-rena', checked_in_at: '2026-08-03T05:00:00.000Z' })]),
    })
    const service = createStaffCheckinService(repository, fixedNow)

    await expect(service.getState(user, 'store-selected')).resolves.toMatchObject({
      available: true,
      my_checkin: { checked_in_at: existing.checked_in_at },
      staff_name: 'ソラ',
    })
    await expect(service.cancel(user, 'store-selected')).resolves.toEqual({ cancelled: true })
    expect(repository.deleteToday).toHaveBeenCalledWith(
      { staffId: 'staff-sora', organizationId: 'org-self' },
      'checkin-sora',
      '2026-08-04T00:00:00+09:00',
      '2026-08-05T00:00:00+09:00',
    )
  })

  it('並行打刻でDB unique違反になった場合も409へ変換する', async () => {
    const repository = createRepository({
      findScheduledCandidates: vi.fn().mockResolvedValue([candidate(sora)]),
      insert: vi.fn().mockRejectedValue({ code: '23505' }),
    })
    const service = createStaffCheckinService(repository, fixedNow)
    await expect(service.checkIn(user, 'store-selected')).rejects.toMatchObject({ status: 409 })
  })

  it('JST当日の範囲を翌日0時未満で固定する', () => {
    expect(getJstDayBounds(fixedNow())).toEqual({
      start: '2026-08-04T00:00:00+09:00',
      end: '2026-08-05T00:00:00+09:00',
    })
  })
})
