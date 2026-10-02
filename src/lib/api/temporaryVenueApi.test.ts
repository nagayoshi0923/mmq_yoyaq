import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const q: Record<string, unknown> = {}
  q.eq = (...a: unknown[]) => { calls.push(['eq', a]); return q }
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  const from = vi.fn((table: string) => { calls.push(['from', [table]]); return { update: (...a: unknown[]) => { calls.push(['update', a]); return q } } })
  return { calls, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
import { temporaryVenueApi } from './temporaryVenueApi'

beforeEach(() => { m.calls.length = 0 })

it('臨時会場の更新は stores を id で絞って update する（元の呼び出しと同じ）', async () => {
  await temporaryVenueApi.updateById('v1', { temporary_dates: ['2026-10-10'], temporary_venue_names: { '2026-10-10': '会場A' } })
  expect(m.calls).toEqual([
    ['from', ['stores']],
    ['update', [{ temporary_dates: ['2026-10-10'], temporary_venue_names: { '2026-10-10': '会場A' } }]],
    ['eq', ['id', 'v1']],
  ])
})
