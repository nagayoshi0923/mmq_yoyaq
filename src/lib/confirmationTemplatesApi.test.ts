import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db, state } = vi.hoisted(() => {
  const state = { missing: false, filters: [] as string[], writes: [] as unknown[] }
  const db = { from: vi.fn((table: string) => {
    const q = {
      select: () => q, order: () => q, limit: () => q, is: () => q,
      eq: (key: string, value: string) => { state.filters.push(`${table}:${key}=${value}`); return q },
      update: (body: unknown) => { state.writes.push(body); return q },
      maybeSingle: async () => ({ error: null, data: table === 'schedule_events' ? (state.missing ? null : { id: 'event-a', store_id: 'store-a', organization_scenario_id: 'scenario-a' }) : table === 'operating_setting_overrides' ? {settings:{},revision:3} : {} }),
    }
    return q
  }), rpc: vi.fn(async (_name: string, body: unknown) => { state.writes.push(body); return {data:{revision:4},error:null} }) }
  return { db, state }
})
vi.mock('../../api/_lib/db.js', () => ({ db, getMissingEnvError: () => null }))
import { confirmationTemplates } from '../../api/_lib/confirmationTemplates'
const user = { orgId: 'org-a', userId: 'staff-a', role: 'staff', jwt: 'unit-test-only' } as const
const res = { setHeader: vi.fn(), status: () => res, json: vi.fn() }
beforeEach(() => { state.missing = false; state.filters = []; state.writes = []; db.from.mockClear(); res.json.mockClear() })
const req = (body = {}) => ({ query: { id: 'event-a', org_id: 'foreign-org', store_id: 'foreign-store' }, body })
describe('confirmation template API organization scope', () => {
  it('uses authenticated organization and event relations for every read', async () => {
    await confirmationTemplates(req() as never, res as never, user)
    for (const table of ['schedule_events', 'organization_scenarios', 'email_settings']) {
      expect(state.filters).toContain(`${table}:organization_id=org-a`)
    }
    expect(state.filters).toContain('email_settings:store_id=store-a')
    expect(state.filters.join()).not.toContain('foreign-')
  })
  it('does not read templates or write when the event is outside the organization', async () => {
    state.missing = true
    await expect(confirmationTemplates(req() as never, res as never, {...user,role: 'admin'}, true)).rejects.toMatchObject({ status: 404 })
    expect(db.from).toHaveBeenCalledTimes(1)
    expect(state.writes).toEqual([])
  })
  it('only updates the selected template in the authenticated organization', async () => {
    await confirmationTemplates(req({ templateKey: 'private_confirm_template', value: ' template ' }) as never, res as never, {...user,role: 'admin'}, true)
    expect(state.writes).toEqual([{p_organization_id:'org-a',p_scope:'performance',p_target_id:'event-a',p_values:{private_confirm_template:'template'},p_expected_revision:3}])
    expect(state.filters.filter(v => v === 'schedule_events:organization_id=org-a')).toHaveLength(1)
  })
  it('keeps staff read-only', async () => {
    await expect(confirmationTemplates(req({ templateKey:'private_confirm_template',value:'x' }) as never,res as never,user,true)).rejects.toMatchObject({status:403})
    expect(state.writes).toEqual([])
  })
  it('rejects arbitrary field updates' , async () => {
    await expect(confirmationTemplates(req({ templateKey: 'organization_id', value: 'foreign-org' }) as never, res as never, {...user,role: 'admin'}, true)).rejects.toMatchObject({ status: 400 })
    expect(state.writes).toEqual([])
  })
})
