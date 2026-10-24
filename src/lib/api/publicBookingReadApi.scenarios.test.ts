import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>)
vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'order']) {
    builder[m] = (...args: unknown[]) => { calls.push([m, ...args]); return builder }
  }
  return { supabase: { from: (t: string) => { calls.push(['from', t]); return builder } } }
})
import { publicBookingListReadApi } from './publicBookingReadApi'

describe('公開中の作品の取得（トップの新作一覧・作品から探すで共通）', () => {
  it('公開中・ガイド用以外だけ。組織トップでは組織で絞る。公開日に使う created_at も読む', async () => {
    calls.length = 0
    await publicBookingListReadApi.listAvailableScenarios('org-1')
    expect(calls[0]).toEqual(['from', 'organization_scenarios_with_master'])
    expect(String(calls.find((c) => c[0] === 'select')?.[1])).toMatch(/\brelease_date\b.*\bcreated_at\b/)
    expect(calls).toContainEqual(['eq', 'status', 'available'])
    expect(calls).toContainEqual(['neq', 'scenario_type', 'gm_test'])
    expect(calls).toContainEqual(['eq', 'organization_id', 'org-1'])
  })

  it('全体トップ（組織なし）は組織で絞らない', async () => {
    calls.length = 0
    await publicBookingListReadApi.listAvailableScenarios(null)
    expect(calls.some((c) => c[0] === 'eq' && c[1] === 'organization_id')).toBe(false)
  })
})
