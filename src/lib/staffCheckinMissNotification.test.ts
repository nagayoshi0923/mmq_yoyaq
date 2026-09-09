import { describe, expect, it } from 'vitest'
import {
  buildDedupeKey,
  formatMissingCheckinMessage,
  findMissingCheckinCandidates,
  getJstDate,
  getJstDateRange,
  isMissingCheckinEventDue,
  parseJstDateTime,
  type CheckinRecord,
  type CheckinStaff,
  type MissingCheckinEvent,
} from '../../supabase/functions/notify-missing-staff-checkins/logic'

const staffA: CheckinStaff = { id: 'staff-a', organization_id: 'org-a', name: 'GM A', status: 'active' }
const staffB: CheckinStaff = { id: 'staff-b', organization_id: 'org-a', name: 'GM B', status: 'active' }
const otherOrgStaff: CheckinStaff = { id: 'staff-x', organization_id: 'org-x', name: 'GM X', status: 'active' }

function event(overrides: Partial<MissingCheckinEvent> = {}): MissingCheckinEvent {
  return {
    id: 'event-a',
    organization_id: 'org-a',
    store_id: 'store-a',
    store_name: '店舗A',
    date: '2026-08-05',
    start_time: '10:00:00',
    scenario: 'シナリオA',
    gms: ['GM A'],
    status: 'scheduled',
    is_cancelled: false,
    ...overrides,
  }
}

describe('notify-missing-staff-checkins logic', () => {
  it('通知本文は公演情報・店舗名・GM名を3行で差し込む', () => {
    expect(formatMissingCheckinMessage({ event: event({ start_time: '13:00:00', scenario: 'テスト公演', store_name: 'テスト店舗' }), staff: { ...staffA, name: 'テストGM' } })).toBe([
      '⚠️ 出勤打刻漏れ｜13:00 テスト公演',
      '店舗：テスト店舗',
      'テストGMさんが公演開始55分前時点で未打刻です',
    ].join('\n'))
  })

  it('JSTの公演開始55分前ちょうどを含めて判定する', () => {
    expect(parseJstDateTime('2026-08-05', '10:00:00')?.toISOString()).toBe('2026-08-05T01:00:00.000Z')
    expect(isMissingCheckinEventDue(event(), new Date('2026-08-05T00:04:59.999Z'))).toBe(false)
    expect(isMissingCheckinEventDue(event(), new Date('2026-08-05T00:05:00.000Z'))).toBe(true)
    expect(isMissingCheckinEventDue(event(), new Date('2026-08-05T00:05:00.001Z'))).toBe(true)
  })

  it('JSTの日付境界でも公演開始55分前の境界を正しく扱う', () => {
    const lateNight = event({ date: '2026-08-06', start_time: '00:05:00' })
    expect(isMissingCheckinEventDue(lateNight, new Date('2026-08-05T14:09:59.999Z'))).toBe(false) // 2026-08-05 23:09:59.999 JST
    expect(isMissingCheckinEventDue(lateNight, new Date('2026-08-05T14:10:00.000Z'))).toBe(true) // 2026-08-05 23:10 JST
    expect(isMissingCheckinEventDue(lateNight, new Date('2026-08-05T15:55:00.000Z'))).toBe(true) // 2026-08-06 00:55 JST
    expect(getJstDate('2026-08-05T15:00:00.000Z')).toBe('2026-08-06')
    expect(getJstDateRange(new Date('2026-08-05T15:00:00.000Z'))).toEqual(['2026-08-06', '2026-08-07'])
  })

  it('打刻済み・中止公演・他組織のスタッフを通知対象から除外する', () => {
    const events = [
      event({ gms: ['GM A', 'GM B'] }),
      event({ id: 'cancelled', is_cancelled: true, gms: ['GM B'] }),
      event({ id: 'org-boundary-event', gms: ['GM X'] }),
    ]
    const checkins: CheckinRecord[] = [{
      staff_id: 'staff-a',
      store_id: 'store-a',
      organization_id: 'org-a',
      checked_in_at: '2026-08-05T00:30:00.000Z',
    }]
    const candidates = findMissingCheckinCandidates(
      events,
      [staffA, staffB, otherOrgStaff],
      checkins,
      new Date('2026-08-05T01:00:00.000Z'),
    )
    expect(candidates.map(candidate => candidate.staff.id)).toEqual(['staff-b'])
    expect(buildDedupeKey(candidates[0])).toBe('event-a:staff-b:2026-08-05')
  })

  it('同じGMでも店舗が違えば別店舗の打刻を流用しない', () => {
    const candidates = findMissingCheckinCandidates(
      [event({ store_id: 'store-b', store_name: '店舗B' })],
      [staffA],
      [{
        staff_id: staffA.id,
        store_id: 'store-a',
        organization_id: 'org-a',
        checked_in_at: '2026-08-05T00:30:00.000Z',
      }],
      new Date('2026-08-05T01:00:00.000Z'),
    )
    expect(candidates).toHaveLength(1)
  })
})
