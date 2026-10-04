import { describe, expect, it } from 'vitest'
import { buildAddFormData, buildEditFormData, findEventScenario, resolveAddEndTime, resolveEventTimeSlot } from './initialForm'
import type { Scenario } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'

const scenarios = [{ id: 'm1', scenario_master_id: 'm1', title: '作品A', player_count_max: 6 }] as unknown as Scenario[]

describe('公演の詳細画面を開いたときの値', () => {
  it('作品はタイトル一致を優先し、無ければ作品の ID で探す', () => {
    expect(findEventScenario(scenarios, { scenario: '作品A' })?.id).toBe('m1')
    expect(findEventScenario(scenarios, { scenario: '旧名', scenario_master_id: 'm1' })?.id).toBe('m1')
    expect(findEventScenario(scenarios, { scenario: '不明' })).toBeUndefined()
  })
  it('時間帯は保存値、無ければ開始時刻から', () => {
    expect(resolveEventTimeSlot({ time_slot: '夜', start_time: '10:00' } as ScheduleEvent)).toBe('evening')
    expect(resolveEventTimeSlot({ start_time: '11:30' } as ScheduleEvent)).toBe('morning')
    expect(resolveEventTimeSlot({ start_time: '14:00' } as ScheduleEvent)).toBe('afternoon')
    expect(resolveEventTimeSlot({ start_time: '17:00' } as ScheduleEvent)).toBe('evening')
  })
  it('追加の終了時刻は既定、開始より前なら開始 + 4 時間', () => {
    expect(resolveAddEndTime('14:30', '18:30')).toBe('18:30')
    expect(resolveAddEndTime('19:30', '18:30')).toBe('23:30')
  })
  it('編集の値: 作品名・定員・担当を揃え、確認待ちのスタッフ参加は入力からは外す', () => {
    const event = { id: 'e', scenario: '旧名', max_participants: 8, time_slot: undefined, start_time: '19:00', gms: ['古い'], reservation_name: null } as unknown as ScheduleEvent
    const participation = { entries: [{ staff_id: 's1', mode: 'included', reservation_id: null }, { staff_id: 's2', mode: 'additional', reservation_id: null, needs_confirmation: true }], assignment: { gms: ['松井'], gm_roles: { 松井: 'main' } } }
    const f = buildEditFormData(event, scenarios[0], 'evening', participation as never)
    expect(f).toMatchObject({ scenario: '作品A', scenario_master_id: 'm1', time_slot: '夜', max_participants: 6, capacity: 8, gms: ['松井'], gmRoles: { 松井: 'main' }, reservation_name: '' })
    expect(f.staffParticipation?.entries.map(e => e.staff_id)).toEqual(['s1'])
    expect(f.staffParticipation?.expected).toHaveLength(2)
  })
  it('追加の値: 空の作品・オープン公演・メモを備考に', () => {
    expect(buildAddFormData({ id: '1', date: '2026-10-05', venue: 's1', startTime: '19:00', endTime: '23:00', notes: 'メモ' })).toMatchObject({ scenario: '', category: 'open', notes: 'メモ', start_time: '19:00', end_time: '23:00', gms: [] })
  })
})
