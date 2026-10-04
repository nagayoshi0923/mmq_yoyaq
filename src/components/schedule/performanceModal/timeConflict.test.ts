import { describe, expect, it } from 'vitest'
import { findTimeConflict } from './timeConflict'
import { buildScenarioSelectOptions } from './scenarioSelectOptions'
import { getStaffTextColor, timeOptions } from './constants'
import type { ScheduleEvent } from '@/types/schedule'
import type { Scenario, Staff } from '@/types'

const ev = (over: Partial<ScheduleEvent>) => ({ id: 'e1', date: '2026-10-04', venue: 's1', store_id: 's1', start_time: '14:00', end_time: '17:00', scenario: '作品A', is_cancelled: false, ...over }) as ScheduleEvent
const form = { start_time: '17:30', end_time: '20:30', date: '2026-10-04', venue: 's1', scenario: '作品B' }
const base = { scenarios: [{ id: 'a', title: '作品A' }, { id: 'b', title: '作品B' }], preparationReady: true, resolvePreparation: () => 60 }

describe('公演の詳細画面の時間の重なり', () => {
  it('準備時間込みで間隔が足りなければ「間隔不足」、時間が重なれば「重複」を優先', () => {
    expect(findTimeConflict({ ...base, form, events: [ev({})] })?.kind).toBe('interval')
    const r = findTimeConflict({ ...base, form, events: [ev({}), ev({ id: 'e2', start_time: '18:00', end_time: '21:00' })] })
    expect(r?.kind).toBe('overlap'); expect(r?.event.id).toBe('e2')
  })
  it('自分自身・別の日・別の店舗・中止・貸切・準備時間が未読込は対象外', () => {
    expect(findTimeConflict({ ...base, form, events: [ev({ id: 'me' })], editingEventId: 'me' })).toBeNull()
    expect(findTimeConflict({ ...base, form, events: [ev({ date: '2026-10-05' })] })).toBeNull()
    expect(findTimeConflict({ ...base, form, events: [ev({ venue: 's2' })] })).toBeNull()
    expect(findTimeConflict({ ...base, form, events: [ev({ is_cancelled: true })] })).toBeNull()
    expect(findTimeConflict({ ...base, form: { ...form, is_private_request: true }, events: [ev({})] })).toBeNull()
    expect(findTimeConflict({ ...base, preparationReady: false, form, events: [ev({})] })).toBeNull()
  })
})

describe('公演の詳細画面の作品の選択肢', () => {
  const staff = [
    { id: 'g1', name: '松井', status: 'active', special_scenarios: ['m-b'] },
    { id: 'g2', name: 'えいきち', status: 'active', special_scenarios: ['m-a'] },
  ] as unknown as Staff[]
  const scenarios = [
    { id: 'a', scenario_master_id: 'm-a', title: '作品A', play_count: 1, available_stores: ['s2'] },
    { id: 'b', scenario_master_id: 'm-b', title: '作品B', play_count: 5 },
    { id: 'c', scenario_master_id: 'm-c', title: '作品C', play_count: 9 },
  ] as unknown as Scenario[]
  it('担当かつ出勤 → 担当のみ → その他の順。この店舗で公演できない作品に印', () => {
    const opts = buildScenarioSelectOptions(scenarios, 's1', staff, [staff[0]])
    expect(opts.map(o => o.value)).toEqual(['作品B', '作品A', '作品C'])
    expect(opts[1].label).toBe('作品A [公演不可]')
    expect(opts[0].displayInfoSearchText).toBe('松井')
  })
})

describe('公演の詳細画面の固定の値', () => {
  it('時刻は 9:00〜23:30 の30分おき、スタッフの文字色は色の設定または名前から決まる', () => {
    expect(timeOptions[0]).toBe('09:00'); expect(timeOptions[timeOptions.length - 1]).toBe('23:30')
    expect(getStaffTextColor({ name: 'A', avatar_color: '#EFF6FF' } as Staff)).toBe('#2563EB')
    expect(getStaffTextColor({ name: 'A' } as Staff)).toMatch(/^#/)
  })
})
