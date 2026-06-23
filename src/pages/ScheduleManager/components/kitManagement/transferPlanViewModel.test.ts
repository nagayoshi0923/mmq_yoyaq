import { describe, expect, it } from 'vitest'
import type { KitLocation, KitTransferSuggestion } from '@/types'
import { buildTransferPlanViewModel } from './transferPlanViewModel'

function suggestion(overrides: Partial<KitTransferSuggestion> = {}): KitTransferSuggestion {
  return {
    scenario_master_id: 'scenario-1',
    scenario_title: 'テストシナリオ',
    kit_number: 1,
    from_store_id: 'A',
    from_store_name: 'A店',
    to_store_id: 'B',
    to_store_name: 'B店',
    transfer_date: '2026-06-26',
    performance_date: '2026-06-27',
    reason: '2026-06-27 に B店 で公演',
    ...overrides,
  }
}

function location(overrides: Partial<KitLocation> = {}): KitLocation {
  return {
    id: 'loc-1',
    organization_id: 'org-1',
    scenario_master_id: 'scenario-1',
    kit_number: 1,
    store_id: 'A',
    condition: 'good',
    created_at: '',
    updated_at: '',
    scenario: { id: 'scenario-1', title: 'テストシナリオ' } as KitLocation['scenario'],
    ...overrides,
  } as KitLocation
}

const baseParams = {
  mergedSuggestions: [],
  kitLocations: [],
  getStoreGroupId: (storeId: string) => storeId,
  isPickedUp: () => false,
  isDelivered: () => false,
}

describe('buildTransferPlanViewModel', () => {
  it('移動日が選択されている場合は選択日以外の transfer_date を表示しない', () => {
    const view = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [
        suggestion({ transfer_date: '2026-06-25', performance_date: '2026-06-27', kit_number: 1 }),
        suggestion({ transfer_date: '2026-06-26', performance_date: '2026-06-28', kit_number: 2 }),
      ],
    })

    expect(view.sortedDays.map(day => day.dateStr)).toEqual(['2026-06-26'])
    expect(view.sortedDays[0].groups[0].items.map(item => item.kit_number)).toEqual([2])
  })

  it('同じ移動提案と完了記録は重複表示しない', () => {
    const planned = suggestion({ org_scenario_id: 'org-scenario-1' })
    const completion = suggestion({
      ...planned,
      reason: '完了記録',
    })

    const view = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [planned],
      mergedSuggestions: [completion],
    })

    expect(view.displaySuggestions).toHaveLength(1)
    expect(view.sortedDays[0].groups[0].items).toHaveLength(1)
  })

  it('mergedSuggestions の旧計算提案は選択日に合うものだけ表示する', () => {
    const view = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [suggestion({ kit_number: 1 })],
      mergedSuggestions: [
        suggestion({ kit_number: 2, reason: '旧計算の提案' }),
        suggestion({ kit_number: 4, transfer_date: '2026-06-25', reason: '旧計算の提案' }),
        suggestion({ kit_number: 3, reason: '完了記録' }),
      ],
    })

    expect(view.displaySuggestions.map(item => item.kit_number)).toEqual([1, 2, 4, 3])
    expect(view.visibleSuggestions.map(item => item.kit_number)).toEqual([1, 2, 3])
  })

  it('すでに目的地にある未着手キットは表示しないが、回収済みなら表示する', () => {
    const item = suggestion()

    const hidden = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [item],
      kitLocations: [location({ store_id: 'B' })],
    })
    expect(hidden.sortedDays).toHaveLength(0)

    const visible = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [item],
      kitLocations: [location({ store_id: 'B' })],
      isPickedUp: () => true,
    })
    expect(visible.sortedDays).toHaveLength(1)
  })

  it('ステータス件数は表示中の提案だけを数える', () => {
    const view = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [
        suggestion({ transfer_date: '2026-06-26', kit_number: 1 }),
        suggestion({ transfer_date: '2026-06-26', kit_number: 2 }),
        suggestion({ transfer_date: '2026-06-25', kit_number: 3 }),
      ],
      isPickedUp: (_scenarioId, kitNumber) => kitNumber === 1 || kitNumber === 2 || kitNumber === 3,
      isDelivered: (_scenarioId, kitNumber) => kitNumber === 2 || kitNumber === 3,
    })

    expect(view.visibleSuggestions.map(item => item.kit_number)).toEqual([1, 2])
    expect(view.statusCounts).toEqual({
      delivered: 1,
      pickedUp: 1,
      remaining: 0,
    })
  })

  it('起点店舗では降ろすルートを表示しない', () => {
    const view = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [
        suggestion({ kit_number: 1, from_store_id: 'A', from_store_name: 'A店', to_store_id: 'B', to_store_name: 'B店' }),
        suggestion({ kit_number: 2, from_store_id: 'C', from_store_name: 'C店', to_store_id: 'A', to_store_name: 'A店' }),
      ],
      scheduleEvents: [
        { date: '2026-06-27', store_id: 'B', scenario_master_id: 'scenario-1', current_participants: 1 },
        { date: '2026-06-27', store_id: 'A', scenario_master_id: 'scenario-1', current_participants: 1 },
      ],
      demandDates: ['2026-06-27'],
      transferStartStoreIds: { '2026-06-26': 'C' },
    })

    const firstStop = view.sortedDays[0].routeStops[0]
    expect(firstStop.groupId).toBe('C')
    expect(firstStop.outgoingRoutes).toHaveLength(1)
    expect(firstStop.incomingRoutes).toHaveLength(0)
    expect(firstStop.incomingCount).toBe(0)
  })

  it('移動必要を含むルートとキットを優先して並べる', () => {
    const view = buildTransferPlanViewModel({
      ...baseParams,
      transferDates: ['2026-06-26'],
      plannedTransfers: [
        suggestion({
          kit_number: 1,
          scenario_title: '優先度低',
          from_store_id: 'A',
          from_store_name: 'A店',
          to_store_id: 'B',
          to_store_name: 'B店',
        }),
        suggestion({
          kit_number: 2,
          scenario_title: '移動必要',
          from_store_id: 'A',
          from_store_name: 'A店',
          to_store_id: 'C',
          to_store_name: 'C店',
        }),
      ],
      scheduleEvents: [
        { date: '2026-06-27', store_id: 'B', scenario_master_id: 'scenario-1', current_participants: 0 },
        { date: '2026-06-27', store_id: 'C', scenario_master_id: 'scenario-1', current_participants: 3 },
      ],
      demandDates: ['2026-06-27'],
    })

    const firstStop = view.sortedDays[0].routeStops[0]
    expect(firstStop.outgoingRoutes.map(route => route.to_store_id)).toEqual(['C', 'B'])
    expect(firstStop.outgoingRoutes.flatMap(route => route.items.map(item => item.kit_number))).toEqual([2, 1])
  })
})
