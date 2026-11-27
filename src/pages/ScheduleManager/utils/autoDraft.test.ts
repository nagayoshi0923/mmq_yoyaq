import { describe, expect, it } from 'vitest'
import {
  computeDemandScores,
  findSelectionConflicts,
  generateDraftProposals,
  isOpenSlot,
  monthDatesFrom,
  resolveEndTime,
  type DraftProposal,
  type DraftScenario,
  type GenerateDraftInput,
  type SlotRule,
} from './autoDraft'

const OKUBO = 'store-okubo'
const BABA = 'store-baba'

function scenario(id: string, patch: Partial<DraftScenario> = {}): DraftScenario {
  return {
    scenario_master_id: id,
    organization_scenario_id: `os-${id}`,
    title: id,
    duration_minutes: 180,
    weekend_duration_minutes: null,
    max_participants: 6,
    kit_count: 1,
    available_stores: [],
    available_from: null,
    available_until: null,
    main_gm_count: 3,
    demand_score: 0.5,
    is_new: false,
    ...patch,
  }
}

const slotTimes = () => ({ start_time: '19:00', end_time: '23:00' })

function input(patch: Partial<GenerateDraftInput> = {}): GenerateDraftInput {
  return {
    dates: ['2026-12-04'], // 金曜
    storeIds: [OKUBO],
    rules: [{ store_id: OKUBO, weekday: 5, time_slot: 'evening', is_open: true }],
    holidays: new Set(),
    existingEvents: [],
    blockedSlots: [],
    scenarios: [scenario('a')],
    slotTimes,
    ...patch,
  }
}

describe('固定枠', () => {
  const rules: SlotRule[] = [
    { store_id: OKUBO, weekday: 1, time_slot: 'evening', is_open: true },
    { store_id: OKUBO, weekday: 7, time_slot: 'evening', is_open: false },
    { store_id: OKUBO, weekday: 1, time_slot: 'morning', is_open: false },
  ]

  it('曜日の行で開ける・開けないを決める。行が無い枠は開けない', () => {
    expect(isOpenSlot('2026-12-07', OKUBO, 'evening', rules, new Set())).toBe(true) // 月曜
    expect(isOpenSlot('2026-12-07', OKUBO, 'morning', rules, new Set())).toBe(false)
    expect(isOpenSlot('2026-12-07', OKUBO, 'afternoon', rules, new Set())).toBe(false)
    expect(isOpenSlot('2026-12-07', BABA, 'evening', rules, new Set())).toBe(false)
  })

  it('祝日は祝日の行を優先し、祝日の行が無い店舗は曜日の行を使う', () => {
    const holidays = new Set(['2026-12-07'])
    expect(isOpenSlot('2026-12-07', OKUBO, 'evening', rules, holidays)).toBe(false)
    const noHolidayRow = rules.filter(r => r.weekday !== 7)
    expect(isOpenSlot('2026-12-07', OKUBO, 'evening', noHolidayRow, holidays)).toBe(true)
  })
})

describe('下書き案', () => {
  it('開ける枠にだけ作り、既存の公演・募集停止の枠は飛ばす', () => {
    const proposals = generateDraftProposals(input({
      dates: ['2026-12-04', '2026-12-11', '2026-12-18'],
      existingEvents: [{ date: '2026-12-11', store_id: OKUBO, time_slot: '夜', start_time: '19:00', scenario_master_id: 'x' }],
      blockedSlots: [{ date: '2026-12-18', store_id: OKUBO, time_slot: 'evening' }],
      scenarios: [scenario('a'), scenario('b')],
    }))
    expect(proposals.map(p => p.date)).toEqual(['2026-12-04'])
    expect(proposals[0].time_slot).toBe('evening')
  })

  it('時間帯が空の既存公演は開始時刻で枠を判定する', () => {
    const proposals = generateDraftProposals(input({
      existingEvents: [{ date: '2026-12-04', store_id: OKUBO, time_slot: null, start_time: '19:30', scenario_master_id: null }],
    }))
    expect(proposals).toEqual([])
  })

  it('メインGMがいない・その店舗で回せない・公演期間外の作品は選ばない', () => {
    const proposals = generateDraftProposals(input({
      scenarios: [
        scenario('no-gm', { main_gm_count: 0, demand_score: 1 }),
        scenario('other-store', { available_stores: [BABA], demand_score: 1 }),
        scenario('not-yet', { available_from: '2026-12-10', demand_score: 1 }),
        scenario('ended', { available_until: '2026-12-01', demand_score: 1 }),
        scenario('ok', { demand_score: 0.1 }),
      ],
    }))
    expect(proposals[0].scenario?.scenario_master_id).toBe('ok')
    expect(proposals[0].alternatives).toEqual([])
  })

  it('予約の入りやすい作品と新作を優先し、選ばなかった作品は入れ替え候補に並べる', () => {
    const proposals = generateDraftProposals(input({
      scenarios: [
        scenario('low', { demand_score: 0.2 }),
        scenario('high', { demand_score: 0.9 }),
        scenario('new', { demand_score: 0.5, is_new: true }),
      ],
    }))
    expect(proposals[0].scenario?.scenario_master_id).toBe('new')
    expect(proposals[0].alternatives.map(s => s.scenario_master_id)).toEqual(['high', 'low'])
    expect(proposals[0].reasons).toContain('新作')
  })

  it('同じ店舗で 7 日以内に同じ作品は入れず、月に何度も入った作品は点数を下げる', () => {
    const rules: SlotRule[] = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ store_id: OKUBO, weekday, time_slot: 'evening' as const, is_open: true }))
    const dates = monthDatesFrom('2026-12-01', '2026-12-10', '2026-11-13')
    const proposals = generateDraftProposals(input({
      dates,
      rules,
      scenarios: [scenario('a', { demand_score: 0.9 }), scenario('b', { demand_score: 0.8 }), scenario('c', { demand_score: 0.7 })],
    }))
    const byDate = proposals.map(p => p.scenario?.scenario_master_id)
    for (let i = 0; i < byDate.length; i++) {
      for (let j = i + 1; j < Math.min(byDate.length, i + 7); j++) {
        if (byDate[i] && byDate[j]) expect(byDate[i]).not.toBe(byDate[j])
      }
    }
    // 3 作品しかないので 4 日目以降は 7 日空けられず、作品なしの枠が出る
    expect(proposals.some(p => p.scenario === null)).toBe(true)
    expect(proposals.find(p => p.scenario === null)?.reasons).toEqual(['条件に合う作品がありません'])
  })

  it('同じ日に別の店舗で使うと、キットの数を超えて同じ作品を入れない', () => {
    const rules: SlotRule[] = [
      { store_id: OKUBO, weekday: 5, time_slot: 'evening', is_open: true },
      { store_id: BABA, weekday: 5, time_slot: 'evening', is_open: true },
    ]
    const one = generateDraftProposals(input({ storeIds: [OKUBO, BABA], rules, scenarios: [scenario('a', { kit_count: 1, demand_score: 0.9 }), scenario('b', { demand_score: 0.1 })] }))
    expect(one.map(p => p.scenario?.scenario_master_id)).toEqual(['a', 'b'])
    const two = generateDraftProposals(input({ storeIds: [OKUBO, BABA], rules, scenarios: [scenario('a', { kit_count: 2, demand_score: 0.9 }), scenario('b', { demand_score: 0.1 })] }))
    expect(two.map(p => p.scenario?.scenario_master_id)).toEqual(['a', 'a'])
  })

  it('終了時刻は作品の公演時間から出し、土日祝は土日祝の公演時間を使う', () => {
    const s = scenario('a', { duration_minutes: 150, weekend_duration_minutes: 210 })
    expect(resolveEndTime('19:00', '23:00', s, false)).toBe('21:30')
    expect(resolveEndTime('13:00', '17:00', s, true)).toBe('16:30')
    expect(resolveEndTime('19:00', '23:00', null, false)).toBe('23:00')
    expect(resolveEndTime('19:00', '23:00', scenario('z', { duration_minutes: 0 }), false)).toBe('23:00')
  })
})

describe('予約の入りやすさ', () => {
  it('オープン公演の埋まり具合 6 割・貸切の件数 4 割で 0〜1 にする', () => {
    const scores = computeDemandScores([
      { date: '2026-10-01', category: 'open', scenario_master_id: 'a', current_participants: 6, max_participants: 6 },
      { date: '2026-10-02', category: 'open', scenario_master_id: 'a', current_participants: 3, max_participants: 6 },
      { date: '2026-10-03', category: 'private', scenario_master_id: 'a', current_participants: 6, max_participants: 6 },
      { date: '2026-10-03', category: 'private', scenario_master_id: 'b', current_participants: 6, max_participants: 6 },
      { date: '2026-10-04', category: 'private', scenario_master_id: 'b', current_participants: 6, max_participants: 6 },
      { date: '2026-10-05', category: 'gmtest', scenario_master_id: 'c', current_participants: 1, max_participants: 6 },
    ])
    expect(scores.get('a')).toBeCloseTo(0.6 * 0.75 + 0.4 * 0.5)
    expect(scores.get('b')).toBe(1)
    expect(scores.has('c')).toBe(false)
  })
})

describe('月の日付', () => {
  it('今日より前の日は含めない', () => {
    expect(monthDatesFrom('2026-11-01', '2026-11-03', '2026-11-02')).toEqual(['2026-11-02', '2026-11-03'])
    expect(monthDatesFrom('2026-12-30', '2026-12-31', '2026-11-13')).toEqual(['2026-12-30', '2026-12-31'])
  })
})

describe('実際の時間の重なり', () => {
  const morningAndAfternoon: SlotRule[] = [
    { store_id: OKUBO, weekday: 5, time_slot: 'morning', is_open: true },
    { store_id: OKUBO, weekday: 5, time_slot: 'afternoon', is_open: true },
  ]
  const times = (_d: string, slot: string) => slot === 'morning'
    ? { start_time: '10:00', end_time: '14:00' }
    : { start_time: '14:30', end_time: '18:30' }

  it('前の枠の作品が次の枠に食い込むなら、次の枠にはその時間に入らない作品を当てない', () => {
    const proposals = generateDraftProposals(input({
      rules: morningAndAfternoon,
      slotTimes: times,
      scenarios: [scenario('long', { duration_minutes: 300, demand_score: 0.9 }), scenario('short', { duration_minutes: 180, demand_score: 0.1 })],
    }))
    expect(proposals.map(p => [p.time_slot, p.scenario?.scenario_master_id, p.end_time])).toEqual([
      ['morning', 'long', '15:00'],
      ['afternoon', undefined, '18:30'],
    ])
  })

  it('既存の公演の終了時刻とも重ならないようにする', () => {
    const proposals = generateDraftProposals(input({
      rules: [{ store_id: OKUBO, weekday: 5, time_slot: 'afternoon', is_open: true }],
      slotTimes: times,
      existingEvents: [{ date: '2026-12-04', store_id: OKUBO, time_slot: '朝', start_time: '10:00', end_time: '15:00', scenario_master_id: 'x' }],
      scenarios: [scenario('a')],
    }))
    expect(proposals[0].scenario).toBeNull()
  })

  it('時間帯の設定には土日祝かどうかを渡す', () => {
    const seen: Array<[string, boolean]> = []
    generateDraftProposals(input({
      dates: ['2026-12-04', '2026-12-05'],
      rules: [{ store_id: OKUBO, weekday: 5, time_slot: 'evening', is_open: true }, { store_id: OKUBO, weekday: 6, time_slot: 'evening', is_open: true }],
      holidays: new Set(['2026-12-04']),
      slotTimes: (d, _s, holiday) => { seen.push([d, holiday]); return { start_time: '19:00', end_time: '23:00' } },
    }))
    expect(seen).toEqual([['2026-12-04', true], ['2026-12-05', true]])
  })
})

describe('登録前の確かめ直し', () => {
  const proposal = (date: string, patch: Partial<DraftProposal> = {}): DraftProposal => ({
    key: `${date}|${OKUBO}|evening`, date, store_id: OKUBO, time_slot: 'evening', start_time: '19:00', end_time: '22:00',
    slot_end_time: '23:00', is_weekend: false, scenario: null, alternatives: [], reasons: [], ...patch,
  })

  it('入れ替えで同じ店舗に 7 日以内の同じ作品ができたら、あとの日の案を止める', () => {
    const b = scenario('b')
    const conflicts = findSelectionConflicts([
      { proposal: proposal('2026-12-05'), scenario: b },
      { proposal: proposal('2026-12-04'), scenario: b },
    ], [])
    expect([...conflicts.keys()]).toEqual([`2026-12-05|${OKUBO}|evening`])
  })

  it('既存の公演とキット数・時間の重なりも確かめる', () => {
    const a = scenario('a', { kit_count: 1 })
    expect(findSelectionConflicts([{ proposal: proposal('2026-12-04'), scenario: a }], [
      { date: '2026-12-04', store_id: BABA, time_slot: '夜', start_time: '19:00', end_time: '22:00', scenario_master_id: 'a' },
    ]).get(`2026-12-04|${OKUBO}|evening`)).toContain('キット')
    expect(findSelectionConflicts([{ proposal: proposal('2026-12-04'), scenario: scenario('c', { duration_minutes: 240 }) }], [
      { date: '2026-12-04', store_id: OKUBO, time_slot: '昼', start_time: '14:30', end_time: '19:30', scenario_master_id: 'x' },
    ]).get(`2026-12-04|${OKUBO}|evening`)).toContain('時間が重なります')
  })
})

describe('日付をまたぐ公演', () => {
  it('終了時刻は翌日の時刻になり、23:59 に切り詰めない', () => {
    expect(resolveEndTime('19:00', '23:00', scenario('long', { duration_minutes: 360 }), false)).toBe('01:00')
  })

  it('夜の公演が翌日にかかっても、同じ日の重なりの判定では夜のうちの重なりとして扱う', () => {
    const conflicts = findSelectionConflicts([
      { proposal: { key: 'k', date: '2026-12-04', store_id: OKUBO, time_slot: 'evening', start_time: '21:00', end_time: '23:00', slot_end_time: '23:00', is_weekend: false, scenario: null, alternatives: [], reasons: [] }, scenario: scenario('c', { duration_minutes: 120 }) },
    ], [
      { date: '2026-12-04', store_id: OKUBO, time_slot: '夜', start_time: '19:00', end_time: '01:00', scenario_master_id: 'x' },
    ])
    expect(conflicts.get('k')).toContain('時間が重なります')
  })
})

it('前日から日付をまたいで続く公演とも重なりを確かめる', () => {
  const conflicts = findSelectionConflicts([
    { proposal: { key: 'k', date: '2026-12-05', store_id: OKUBO, time_slot: 'morning', start_time: '00:30', end_time: '03:00', slot_end_time: '03:00', is_weekend: true, scenario: null, alternatives: [], reasons: [] }, scenario: scenario('c', { duration_minutes: 120 }) },
  ], [
    { date: '2026-12-04', store_id: OKUBO, time_slot: '夜', start_time: '19:00', end_time: '01:00', scenario_master_id: 'x' },
  ])
  expect(conflicts.get('k')).toContain('時間が重なります')
})
