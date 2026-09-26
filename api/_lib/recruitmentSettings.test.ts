import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AuthUser } from './auth'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('./db.js', () => ({ db: mocks }))
import { commonRecruitmentSettings, recruitmentSettings } from './recruitmentSettings'
import { recruitmentMissingLimit } from '../../shared/recruitmentTarget'
const user: AuthUser = { userId: 'actor', orgId: 'org-from-auth', role: 'admin', jwt: '' }
function response() { const r = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; r.status.mockReturnValue(r); return r }
function request(body: unknown) { return { query: { id: 'master' }, body } as VercelRequest }
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { success: true }, error: null }) })
describe('recruitment settings API', () => {
 it.each(['customer', 'staff'] as const)('rejects %s writes', async role => {
  await expect(commonRecruitmentSettings(request({ mode: 'percent', value: 50, expected_updated_at: null }), response() as unknown as VercelResponse, { ...user, role }, true)).rejects.toMatchObject({ status: 403 })
  expect(mocks.rpc).not.toHaveBeenCalled()
 })
 it('rejects missing organization', async () => {
  const res = response(); await commonRecruitmentSettings(request({}), res as unknown as VercelResponse, { ...user, orgId: '' }, true)
  expect(res.status).toHaveBeenCalledWith(403); expect(mocks.rpc).not.toHaveBeenCalled()
 })
 it.each([0, 101, 0.5, '50', null])('rejects invalid percent %s', async value => {
  const res = response(); await commonRecruitmentSettings(request({ mode: 'percent', value, expected_updated_at: null }), res as unknown as VercelResponse, user, true)
  expect(res.status).toHaveBeenCalledWith(400); expect(mocks.rpc).not.toHaveBeenCalled()
 })
 it('uses authenticated organization and actor, not submitted identifiers', async () => {
  const res = response(); await commonRecruitmentSettings(request({ mode: 'percent', value: 50, expected_updated_at: null, organization_id: 'other', actor_id: 'other' }), res as unknown as VercelResponse, user, true)
  expect(mocks.rpc).toHaveBeenCalledWith('save_organization_recruitment_settings', { p_organization_id: user.orgId, p_actor_id: user.userId, p_mode: 'percent', p_value: 50, p_expected_updated_at: null })
  expect(res.status).toHaveBeenCalledWith(200)
 })
 it('returns conflict without claiming a successful save', async () => {
  mocks.rpc.mockResolvedValue({ data: { success: false, error: 'CONFLICT' }, error: null })
  const res = response(); await commonRecruitmentSettings(request({ mode: 'count', value: 2, expected_updated_at: null }), res as unknown as VercelResponse, user, true)
  expect(res.status).toHaveBeenCalledWith(409)
 })
 it('saves custom percent through the atomic v3 RPC', async () => {
  const res = response(); await recruitmentSettings(request({ enabled: true, source: 'custom', mode: 'percent', value: 30, deadline_minutes: 90, expected_updated_at: '2026-09-24T00:00:00Z' }), res as unknown as VercelResponse, user, true)
  expect(mocks.rpc).toHaveBeenCalledWith('save_scenario_recruitment_settings_v3', expect.objectContaining({ p_organization_id: user.orgId, p_master_id: 'master', p_source: 'custom', p_mode: 'percent', p_value: 30 }))
 })
 it.each([[50, 3], [30, 2], [20, 1], [1, 0], [100, 7]])('floors 7 players at %s percent to %s missing', (value, expected) => {
  expect(recruitmentMissingLimit(7, { mode: 'percent', value })).toBe(expected)
 })
})

it('saves independent inheritance sources and common operating values', async () => {
 const res=response()
 await recruitmentSettings(request({ enabled: false, enabled_source: 'common', deadline_source: 'custom', source: 'common', mode: 'count', value: 2, deadline_minutes: 60, expected_updated_at: '2026-09-24T00:00:00Z' }),res as unknown as VercelResponse,user,true)
 expect(mocks.rpc).toHaveBeenCalledWith('save_scenario_recruitment_settings_v3',expect.objectContaining({p_enabled_source:'common',p_deadline_source:'custom',p_deadline_minutes:60}))
 await commonRecruitmentSettings(request({enabled:false,deadline_minutes:120,mode:'count',value:2,expected_updated_at:null}),res as unknown as VercelResponse,user,true)
 expect(mocks.rpc).toHaveBeenCalledWith('save_organization_recruitment_settings_v2',expect.objectContaining({p_enabled:false,p_deadline_minutes:120,p_organization_id:user.orgId}))
})
it.each([0,240,null,1.5])('rejects invalid common deadline %s',async deadline_minutes=>{
 const res=response();await commonRecruitmentSettings(request({enabled:true,deadline_minutes,mode:'count',value:2,expected_updated_at:null}),res as unknown as VercelResponse,user,true)
 expect(res.status).toHaveBeenCalledWith(400);expect(mocks.rpc).not.toHaveBeenCalled()
})

it('allows returning to common even when dormant inputs are invalid',async()=>{
 const res=response();await recruitmentSettings(request({enabled_source:'common',deadline_source:'common',source:'common',enabled:null,deadline_minutes:null,mode:'invalid',value:null,expected_updated_at:'2026-09-24T00:00:00Z'}),res as unknown as VercelResponse,user,true)
 expect(res.status).toHaveBeenCalledWith(200)
 expect(mocks.rpc).toHaveBeenCalledWith('save_scenario_recruitment_settings_v3',expect.objectContaining({p_enabled:null,p_deadline_minutes:null,p_mode:null,p_value:null}))
})
