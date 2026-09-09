import { describe, expect, it } from 'vitest'
import {
  computeKitWarningEventIds,
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
      { scenario_master_id: 'master-1', store_id: 'store-a' },
    ] as KitLocation[]
    const ids = computeKitWarningEventIds([baseEvent], locs, stores)
    expect(ids.has('ev-1')).toBe(false)
  })
})
