import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest } from '@vercel/node'
const mock = vi.hoisted(() => ({ role: 'staff', states: [] as {status:string}[], error: null as unknown, filters: [] as unknown[][] }))
vi.mock('./db.js', () => ({
 getMissingEnvError: () => null,
 db: { auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) },
 from: (table: string) => {
  const chain = { select: () => chain, eq: (...args: unknown[]) => {mock.filters.push([table,...args]);return chain},
   single: async () => ({data: {organization_id:'own-org',role:mock.role},error:null}),
   then: (resolve: (v: unknown)=>unknown) => Promise.resolve({data:mock.states,error:mock.error}).then(resolve) }
  return chain
 } }
}))
import { requireAuth, requireStaff, requireAdmin } from './auth'
const request={headers:{authorization:'Bearer test-token'}} as VercelRequest
beforeEach(()=>{mock.role='staff';mock.states=[];mock.error=null;mock.filters=[]})
describe('スタッフ停止と顧客アクセスの境界',()=>{
 it.each(['staff','admin'])('停止した%sは業務権限を使えないが顧客として認証できる',async role=>{
  mock.role=role;mock.states=[{status:'inactive'}]
  const user=await requireAuth(request)
  expect(user.role).toBe('customer');expect(user.orgId).toBe('');expect(()=>requireStaff(user)).toThrow();expect(()=>requireAdmin(user)).toThrow()
  expect(mock.filters).toContainEqual(['staff','user_id','actor']);expect(mock.filters).toContainEqual(['staff','organization_id','own-org'])
 })
 it.each(['staff','admin'])('退職した%sも業務権限を使えない',async role=>{
  mock.role=role;mock.states=[{status:'resigned'}]
  const user=await requireAuth(request)
  expect(user.role).toBe('customer');expect(user.orgId).toBe('');expect(()=>requireStaff(user)).toThrow()
 })
 it.each(['active','on-leave'])('%sは業務権限を維持する',async status=>{mock.states=[{status}];expect((await requireAuth(request)).role).toBe('staff')})
 it('スタッフ行のない既存管理者を停止扱いにしない',async()=>{mock.role='admin';expect((await requireAuth(request)).role).toBe('admin')})
 it('利用状態の取得失敗では業務アクセスを許可しない',async()=>{mock.error={message:'offline'};await expect(requireAuth(request)).rejects.toMatchObject({status:503})})
 it.each(['customer','license_admin'])('%sの独立権限をスタッフ状態で書き換えない',async role=>{mock.role=role;mock.states=[{status:'inactive'}];expect((await requireAuth(request)).role).toBe(role);expect(mock.filters.some(f=>f[0]==='staff')).toBe(false)})
})
