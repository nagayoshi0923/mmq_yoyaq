import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), past: vi.fn(), history: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: {queryFn:()=>Promise<unknown>}) => options, useMutation: vi.fn(), useQueryClient: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/lib/playedStatus', () => ({ fetchPlayedReservations: mocks.past }))
vi.mock('@/lib/customerPlayHistory', () => ({ customerPlayHistory: { snapshot: mocks.history } }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroupList: async () => [] }))
vi.mock('@/utils/logger', () => ({ logger: {warn:vi.fn(),error:vi.fn()} }))
import { useMyPageDataQuery, type MyPageData } from './useMyPageDataQuery'
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
