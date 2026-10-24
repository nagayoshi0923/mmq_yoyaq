import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  orgs: vi.fn(), keys: vi.fn(), stores: vi.fn(), scenarios: vi.fn(), events: vi.fn(), pauses: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/api/platformPageReadApi', () => ({
  platformPageReadApi: { listActiveOrganizations: api.orgs, getPublicAvailableScenarioKeys: api.keys },
}))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingListReadApi: { listPublicStores: api.stores, listAvailableScenarios: api.scenarios, listAllPublicEventsInRange: api.events },
  publicBookingReadApi: { listPerformancePauses: api.pauses },
}))
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
