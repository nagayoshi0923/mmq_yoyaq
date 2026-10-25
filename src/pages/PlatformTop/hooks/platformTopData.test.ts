import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  orgs: vi.fn(), keys: vi.fn(), stores: vi.fn(), scenarios: vi.fn(), events: vi.fn(), pauses: vi.fn(), holidays: vi.fn(), latest: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/api/platformPageReadApi', () => ({
  platformPageReadApi: { listActiveOrganizations: api.orgs, getPublicAvailableScenarioKeys: api.keys },
}))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingListReadApi: { listPublicStores: api.stores, listAvailableScenarios: api.scenarios, listAllPublicEventsInRange: api.events, latestPublicOpenEventDate: api.latest },
  publicBookingReadApi: { listPerformancePauses: api.pauses },
}))
vi.mock('@/lib/api/bookingConfirmationReadApi', () => ({ bookingConfirmationReadApi: { getPublicCustomHolidays: api.holidays } }))
import { fetchPlatformTopData } from './platformTopData'

const row = (over: Record<string, unknown>) => ({
  id: 'm1', slug: 'm1', title: '作品', author: '', key_visual_url: null, genre: ['新作'], player_count_min: 4, player_count_max: 6,
  release_date: null, is_recommended: false, organization_id: 'o1', scenario_master_id: 'm1', created_at: '2026-10-13T03:00:00Z',
  status: 'available', scenario_type: 'normal', master_status: 'approved', ...over,
})

beforeEach(() => {
  api.orgs.mockResolvedValue({ data: [{ id: 'o1', slug: 'a', name: 'A' }, { id: 'o2', slug: 'b', name: 'B' }], error: null })
  api.stores.mockResolvedValue({ data: [], error: null })
  api.events.mockResolvedValue({ data: [], error: null })
  api.pauses.mockResolvedValue({ data: [], error: null })
  api.holidays.mockResolvedValue({ data: [{ custom_holidays: [] }], error: null })
  api.latest.mockResolvedValue({ date: '2027-02-07', error: null })
})

describe('全体トップの作品（新作一覧の材料）', () => {
  it('公開キーに無い作品（非公開・公開予定）は含めない。公開日に使う日時は組織のうち最も早く公開一覧に加えた日', async () => {
    api.keys.mockResolvedValue({ data: [
      { organization_id: 'o1', scenario_master_id: 'm1' },
      { organization_id: 'o2', scenario_master_id: 'm1' },
    ], error: null })
    api.scenarios.mockResolvedValue({ data: [
      row({ organization_id: 'o2', created_at: '2026-10-07T03:00:00Z' }),
      row({ organization_id: 'o1', created_at: '2025-10-16T03:00:00Z' }),
      row({ id: 'm2', slug: 'm2', title: '非公開', scenario_master_id: 'm2' }),
    ], error: null })
    const data = await fetchPlatformTopData('2026-10-23')
    expect(api.scenarios).toHaveBeenCalledWith(null)
    expect(data.scenarios.map((s) => s.id)).toEqual(['m1'])
    expect(data.scenarios[0].listed_at).toBe('2025-10-16T03:00:00Z')
  })
})

describe('全体トップの公演の料金（2026-10-25 社長報告: 平日・土日祝で違う作品）', () => {
  const costs = [{ time_slot: 'normal', amount: 4500, type: 'fixed' }, { time_slot: 'gmtest', amount: 4000, type: 'fixed' }, { time_slot: 'weekend', amount: 5000, type: 'fixed' }]
  const ev = (date: string) => ({ id: date, date, start_time: '19:00:00', end_time: '22:00:00', store_id: null, current_participants: 0, max_participants: 6, organization_id: 'o1', scenario_master_id: 'm1', category: 'open' })
  beforeEach(() => {
    api.keys.mockResolvedValue({ data: [], error: null })
    api.scenarios.mockResolvedValue({ data: [row({ participation_fee: 4500, participation_costs: costs })], error: null })
    api.events.mockResolvedValue({ data: [ev('2026-10-20'), ev('2026-10-21'), ev('2026-10-25')], error: null })
  })
  const fees = async () => Object.fromEntries((await fetchPlatformTopData('2026-10-19')).performances.map((p) => [p.date, p.fee]))
  it('平日は平日、日曜は土日祝、組織の独自休日（平日）は土日祝の料金', async () => {
    api.holidays.mockResolvedValue({ data: [{ custom_holidays: ['2026-10-21'] }], error: null })
    expect(await fees()).toEqual({ '2026-10-20': 4500, '2026-10-21': 5000, '2026-10-25': 5000 })
  })
  it('独自休日を読めなかった組織の平日の公演は料金を出さない（公演は消さない。土日は確定）', async () => {
    api.holidays.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await fees()).toEqual({ '2026-10-20': null, '2026-10-21': null, '2026-10-25': 5000 })
  })
})
