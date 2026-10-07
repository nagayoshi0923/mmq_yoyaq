import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), past: vi.fn(), history: vi.fn(), ids: vi.fn(), remove: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: {queryFn:()=>Promise<unknown>}) => options, useMutation: (options:unknown) => options, useQueryClient: () => ({invalidateQueries:vi.fn()}) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: async () => ({data:null,error:null}) } }))
vi.mock('@/lib/playedStatus', () => ({ fetchPlayedReservations: mocks.past }))
vi.mock('@/lib/customerPlayHistory', () => ({ customerPlayHistory: { snapshot: mocks.history, remove: mocks.remove } }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroupList: async () => [] }))
vi.mock('@/utils/logger', () => ({ logger: {warn:vi.fn(),error:vi.fn()} }))
vi.mock('@/lib/api/customerHookReadApi', () => ({ customerLookupReadApi: { listIdsByUserId: mocks.ids } }))
import { useMyPageDataQuery, useDeleteManualHistoryMutation, type MyPageData } from './useMyPageDataQuery'
function result(data: unknown) {
  const q: Record<string, unknown> = { then: (resolve: (value:unknown)=>void) => resolve({data,error:null}) }
  for (const name of ['select','eq','ilike','order','limit','maybeSingle','in']) q[name]=()=>q
  return q
}
it('予約一覧50件の外にある過去予約もアルバム・参加数と店舗/作品表示へ使用する', async () => {
  mocks.from.mockImplementation((table:string) => result(table === 'customers'
    ? { id:'customer',name:'Fixture' }
    : table === 'reservations'
      ? Array.from({length:50},(_,i)=>({id:`future-${i}`,requested_datetime:'2999-01-01',status:'confirmed'}))
      : table === 'scenario_masters' ? [{id:'old-scenario',title:'過去作品',key_visual_url:'image'}]
      : table === 'stores' ? [{id:'old-store',name:'過去店舗'}]
      : table === 'organizations' ? [{id:'old-org',slug:'fixture',name:'検証組織'}] : []))
  mocks.past.mockResolvedValue([{id:'old',title:'過去作品',scenario_master_id:'old-scenario',store_id:'old-store',organization_id:'old-org',requested_datetime:'2020-01-01T12:00:00+09:00',status:'completed'}])
  mocks.history.mockResolvedValue({manual:[],overrides:[{scenario_master_id:'old-scenario'}]})
  const query = useMyPageDataQuery(undefined,'fixture@example.test') as unknown as {queryFn:()=>Promise<MyPageData>}
  const data = await query.queryFn()
  expect(data.reservations).toHaveLength(50)
  expect(data.stats.participationCount).toBe(1)
  expect(data.playedScenarios).toEqual([expect.objectContaining({reservation_id:'old',scenario_id:'old-scenario',venue:'過去店舗',organization_slug:'fixture',key_visual_url:'image'})])
  expect(data.playedOverrideIds).toEqual(new Set(['old-scenario']))
})

it('マイページでも別の本人顧客行の手動履歴と未体験指定を集約する', async () => {
 mocks.ids.mockResolvedValue({data:[{id:'customer'},{id:'legacy'}],error:null})
 mocks.from.mockImplementation((table:string) => result(table==='customers'?{id:'customer',name:'Fixture'}:[]))
 mocks.past.mockResolvedValue([])
 mocks.history.mockImplementation(async (id:string)=>({can_edit:true,manual:id==='legacy'?[{id:'legacy-manual',scenario_master_id:'legacy-scenario',scenario_title:'別本人行の作品',played_at:null,venue:null}]:[],overrides:id==='legacy'?[{scenario_master_id:'override-other'}]:[]}))
 const query=useMyPageDataQuery(undefined,'fixture@example.test') as unknown as {queryFn:()=>Promise<MyPageData>}
 // 実ログイン経路のID一覧はuserIdありで取得する。紐付けRPCのみ既存fixtureへ差し替える。
 const dataQuery=useMyPageDataQuery('owner','fixture@example.test') as unknown as {queryFn:()=>Promise<MyPageData>}
 const data=await dataQuery.queryFn()
 expect(data.playedScenarios).toEqual(expect.arrayContaining([expect.objectContaining({scenario_id:'legacy-scenario',manual_id:'legacy-manual'})]))
 expect(data.playedOverrideIds).toContain('override-other')
 expect(mocks.history).toHaveBeenCalledWith('legacy')
 expect(query).toHaveProperty('queryFn')
})
it('別本人行の手動履歴をprimary IDへ誤送信せず実所有IDで削除する', async () => {
 mocks.ids.mockResolvedValue({data:[{id:'customer'},{id:'legacy'}],error:null})
 mocks.history.mockImplementation(async (id:string)=>({can_edit:true,manual:id==='legacy'?[{id:'legacy-manual'}]:[],overrides:[]}));mocks.remove.mockResolvedValue(true)
 const mutation=useDeleteManualHistoryMutation('customer','owner','fixture@example.test') as unknown as {mutationFn:(id:string)=>Promise<void>}
 await mutation.mutationFn('legacy-manual')
 expect(mocks.remove).toHaveBeenLastCalledWith('legacy','legacy-manual')
})
