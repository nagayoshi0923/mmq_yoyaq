import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, state } = vi.hoisted(() => {
  const state = { organization: true, scenarioQueries: [] as string[], selections: [] as string[] }
  const db = { from: vi.fn((table: string) => {
    if (table === 'organizations') {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.organization ? { id: 'org-a' } : null, error: null }) }
      return query
    }
    const query = {
      select: (fields: string) => { state.selections.push(fields); return query },
      eq: (key: string, value: string) => { state.scenarioQueries.push(`${key}=${value}`); return query },
      order: async () => ({ data: [{ id: 'scenario-a', title: '公開作品' }], error: null }),
    }
    return query
  }) }
  return { db, state }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }))
vi.stubEnv('SUPABASE_URL', 'https://example.invalid')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unit-test-only')
const { default: handler } = await import('../../api/scenarios')

async function request(query: Record<string, string>) {
  const res = { statusCode: 200, body: undefined as unknown, setHeader: vi.fn(), status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this } }
  await handler({ method: 'GET', query, headers: {} } as never, res as never)
  return res
}
beforeEach(() => { state.organization = true; state.scenarioQueries = []; state.selections = []; db.from.mockClear() })
describe('anonymous public scenario list', () => {
  it('returns only public fields for available scenarios in the requested organization', async () => {
    const res = await request({ type: 'public', org_id: 'org-a' })
    expect(res.statusCode).toBe(200)
    expect(state.scenarioQueries).toEqual(['status=available', 'organization_id=org-a'])
    expect(state.selections[0]).toContain('accepts_private_booking')
    expect(state.selections[0]).not.toMatch(/author_email|gm_costs|license_amount|notes/)
  })
  it('rejects an inactive or missing organization before reading scenarios', async () => {
    state.organization = false
    expect((await request({ type: 'public', org_id: 'org-a' })).statusCode).toBe(404)
    expect(state.selections).toEqual([])
  })
  it('keeps administrative lists and statistics unavailable anonymously', async () => {
    for (const type of ['legacy', 'stats', 'all-stats', 'paginated']) {
      expect((await request({ type, org_id: 'org-a' })).statusCode).toBe(401)
    }
    expect(db.from).not.toHaveBeenCalled()
  })
  it('requires an organization for anonymous access', async () => {
    expect((await request({ type: 'public' })).statusCode).toBe(401)
    expect(db.from).not.toHaveBeenCalled()
  })
})
