import { describe, expect, it } from 'vitest'
import {
  computeKitShortageForDay,
  computeKitWarningEventIds,
  countUsableKits,
  getUsableKitStoreIds,
  hasKitAtVenueOrGroup,
  requiresKitWarningForCategory,
} from './scheduleWarnings'
import type { KitLocation } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'

const stores = [
  { id: 'store-a', short_name: 'A', kit_group_id: null },
  { id: 'store-b', short_name: 'B', kit_group_id: 'group-1' },
  { id: 'store-c', short_name: 'C', kit_group_id: 'group-1' },
  { id: 'store-d', short_name: 'D', kit_group_id: null },
]

describe('requiresKitWarningForCategory', () => {
  it('オープン・貸切は警告対象', () => {
    expect(requiresKitWarningForCategory('open')).toBe(true)
    expect(requiresKitWarningForCategory('private')).toBe(true)
  })

  it('出張・場所貸し・MTG は対象外', () => {
    expect(requiresKitWarningForCategory('offsite')).toBe(false)
    expect(requiresKitWarningForCategory('venue_rental')).toBe(false)
    expect(requiresKitWarningForCategory('venue_rental_free')).toBe(false)
    expect(requiresKitWarningForCategory('mtg')).toBe(false)
  })
})

describe('hasKitAtVenueOrGroup', () => {
  it('配置0件は未配置', () => {
    expect(hasKitAtVenueOrGroup([], 'store-a', stores)).toBe(false)
  })

  it('同店舗にあれば true', () => {
    expect(hasKitAtVenueOrGroup(['store-a'], 'store-a', stores)).toBe(true)
  })

  it('同一キットグループにあれば true', () => {
    expect(hasKitAtVenueOrGroup(['store-b'], 'store-c', stores)).toBe(true)
  })

  it('別グループなら false', () => {
    expect(hasKitAtVenueOrGroup(['store-a'], 'store-d', stores)).toBe(false)
  })
})

describe('computeKitWarningEventIds', () => {
  const futureDate = '2099-01-15'
  const baseEvent = {
    id: 'ev-1',
    date: futureDate,
    store_id: 'store-a',
    venue: 'store-a',
    scenario: 'テスト',
    scenario_master_id: 'master-1',
    category: 'open',
    is_cancelled: false,
    start_time: '10:00',
    end_time: '14:00',
  } as ScheduleEvent

  it('配置レコード0件でも警告対象にする', () => {
    const ids = computeKitWarningEventIds([baseEvent], [], stores)
    expect(ids.has('ev-1')).toBe(true)
  })

  it('同店舗に配置があれば警告しない', () => {
    const locs = [
      { scenario_master_id: 'master-1', store_id: 'store-a', condition: 'good' },
    ] as KitLocation[]
    const ids = computeKitWarningEventIds([baseEvent], locs, stores)
    expect(ids.has('ev-1')).toBe(false)
  })
  const location = (condition: KitLocation['condition'], storeId = 'store-a') =>
    ({ scenario_master_id: 'master-1', store_id: storeId, condition }) as KitLocation

  it.each(['damaged', 'repairing', 'missing_parts', 'retired'] as const)(
    '%s のキットしかない場合は同店舗でも未配置警告を出す', (condition) => {
      expect(computeKitWarningEventIds([baseEvent], [location(condition)], stores).has('ev-1')).toBe(true)
    },
  )

  it('同一キットグループでも不備キットは使えず、良好なキットがあれば警告しない', () => {
    const event = { ...baseEvent, store_id: 'store-c', venue: 'store-c' }
    const damaged = location('damaged', 'store-b')
    expect(computeKitWarningEventIds([event], [damaged], stores).has('ev-1')).toBe(true)
    expect(computeKitWarningEventIds([event], [damaged, location('good', 'store-b')], stores).has('ev-1')).toBe(false)
  })

  it('他店舗や別作品の良好キットでは未配置警告を消さない', () => {
    const locations = [location('missing_parts'), location('good', 'store-d'),
      { ...location('good'), scenario_master_id: 'other-master' }]
    expect(computeKitWarningEventIds([baseEvent], locations, stores).has('ev-1')).toBe(true)
  })

  it('正常→不備→修復で警告が切り替わる', () => {
    for (const [condition, warning] of [['good', false], ['damaged', true], ['good', false]] as const) {
      expect(computeKitWarningEventIds([baseEvent], [location(condition)], stores).has('ev-1')).toBe(warning)
    }
  })

  it('中止・過去・キット不要の公演は不備があっても対象外', () => {
    const events = [{ ...baseEvent, is_cancelled: true }, { ...baseEvent, date: '2000-01-01' },
      ...['offsite', 'venue_rental', 'venue_rental_free', 'mtg'].map(category => ({ ...baseEvent, category }))] as ScheduleEvent[]
    expect(computeKitWarningEventIds(events, [location('damaged')], stores).size).toBe(0)
  })

  it('モーダル用の配置一覧にも良好なキットの有効な店舗IDだけを返す', () => {
    expect(getUsableKitStoreIds([location('damaged'), location('good', 'store-b'),
      location('good', 'store-b'), location('good', ''), { ...location('good'), condition: undefined } as unknown as KitLocation])).toEqual(['store-b'])
  })

})

describe('computeKitShortageForDay（#376 その日のキット不足）', () => {
  const ev = (id: string, store: string, extra: Partial<ScheduleEvent> = {}) =>
    ({ id, date: '2030-01-05', store_id: store, venue: store, scenario_master_id: 'master-1', category: 'open', is_cancelled: false, ...extra }) as ScheduleEvent
  const target = { date: '2030-01-05', venueId: 'store-a', scenarioId: 'master-1', category: 'open' }

  it('その日の店舗数が使用可能なキット数を超えると不足を返す', () => {
    expect(computeKitShortageForDay(target, [ev('e1', 'store-d')], 1, stores)).toEqual({ demand: 2, usable: 1 })
    expect(computeKitShortageForDay(target, [ev('e1', 'store-d')], 2, stores)).toBeNull()
  })

  it('同じ店舗・同じキットグループの公演は1つと数える', () => {
    expect(computeKitShortageForDay(target, [ev('e1', 'store-a')], 1, stores)).toBeNull()
    expect(computeKitShortageForDay({ ...target, venueId: 'store-b' }, [ev('e1', 'store-c')], 1, stores)).toBeNull()
  })

  it('取消・別の日・別作品・キット不要の公演と、編集中の公演自身は数えない', () => {
    const others = [ev('e1', 'store-d', { is_cancelled: true }), ev('e2', 'store-d', { date: '2030-01-06' }),
      ev('e3', 'store-d', { scenario_master_id: 'other' }), ev('e4', 'store-d', { category: 'offsite' })]
    expect(computeKitShortageForDay(target, others, 1, stores)).toBeNull()
    expect(computeKitShortageForDay({ ...target, eventId: 'self' }, [ev('self', 'store-d')], 1, stores)).toBeNull()
  })

  it('キットが1つもない場合とキット不要の公演では返さない（未配置の警告に任せる）', () => {
    expect(computeKitShortageForDay(target, [ev('e1', 'store-d')], 0, stores)).toBeNull()
    expect(computeKitShortageForDay({ ...target, category: 'mtg' }, [ev('e1', 'store-d')], 1, stores)).toBeNull()
  })

  it('良好なキットだけを数える', () => {
    const loc = (condition: KitLocation['condition']) => ({ scenario_master_id: 'master-1', store_id: 'store-a', condition }) as KitLocation
    expect(countUsableKits([loc('good'), loc('good'), loc('damaged')])).toBe(2)
  })
})

describe('computeKitShortageForDay の追加の決まり（#833）', () => {
  const target = { date: '2030-01-05', venueId: 'store-a', scenarioId: 'master-1', category: 'private' }
  const legacy = (store: string) => ({ id: `legacy-${store}`, date: '2030-01-05', store_id: store, venue: store, scenario_id: 'master-1', category: 'open', is_cancelled: false }) as unknown as ScheduleEvent & { scenario_id: string }

  it('旧データ（scenario_id だけ）の公演も同じ日の需要に数える', () => {
    expect(computeKitShortageForDay(target, [legacy('store-d')], 1, stores)).toEqual({ demand: 2, usable: 1 })
  })

  it('reportZero のときは使用可能なキットが0個でも返す（貸切の承認画面用）', () => {
    expect(computeKitShortageForDay(target, [], 0, stores)).toBeNull()
    expect(computeKitShortageForDay(target, [], 0, stores, { reportZero: true })).toEqual({ demand: 1, usable: 0 })
  })
})
