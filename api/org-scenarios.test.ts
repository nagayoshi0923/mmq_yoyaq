import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mocks = vi.hoisted(() => ({ from: vi.fn(), role: 'admin', error: false }))
vi.mock('./_lib/db.js', () => ({ db: mocks, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/auth.js')>()
  return { ...actual, requireAuth: async () => ({ orgId: 'own-org', role: mocks.role }) }
})
import handler from './org-scenarios'
async function request(query: Record<string, string>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
  await handler({ method: 'GET', headers: {}, query } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.role = 'admin'
  mocks.error = false
  mocks.from.mockImplementation(() => {
    const filters: Record<string, string> = {}
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: string) => { filters[key] = value; return chain }),
      maybeSingle: async () => ({
        data: filters.organization_id === 'own-org' && filters.scenario_master_id === 'owned-master'
          ? { id: 'own-row', override_title: null, custom_sensitive_tags: [] } : null,
        error: mocks.error ? { message: 'database failure' } : null,
      }),
    }
    return chain
  })
})
describe('作品の設定元API', () => {
  it('指定された他組織IDを採用せず認証した組織の生の設定を返す', async () => {
    const res = await request({ type: 'settings-source', masterId: 'owned-master', organization_id: 'other-org' })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ id: 'own-row', override_title: null, custom_sensitive_tags: [] })
  })
  it('他組織だけが所有する作品は返さない', async () => {
    const res = await request({ type: 'settings-source', masterId: 'other-master' })
    expect(res.json).toHaveBeenCalledWith(null)
  })
  it('顧客は設定元を取得できない', async () => {
    mocks.role = 'customer'
    const res = await request({ type: 'settings-source', masterId: 'owned-master' })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('DB失敗を設定未登録として扱わない', async () => {
    mocks.error = true
    const res = await request({ type: 'settings-source', masterId: 'owned-master' })
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
