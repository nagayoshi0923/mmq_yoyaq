// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), settings: vi.fn(), from: vi.fn(), failTable: '', queries: [] as Array<{table: string; filters: Record<string, unknown>}> }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroupList: mocks.read }))
vi.mock('@/lib/groupSurveySettings', () => ({ getGroupsSurveySettings: mocks.settings }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: async () => 'org' }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))
import { usePrivateGroupList } from './usePrivateGroupList'
let root: Root
const result = {current: undefined as unknown as ReturnType<typeof usePrivateGroupList>}
function Harness() {result.current=usePrivateGroupList();return null}
async function render() {root=createRoot(document.createElement('div'));await act(async()=>root.render(<Harness/>))}
afterEach(async()=>{if(root)await act(async()=>root.unmount())})
beforeEach(() => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  vi.clearAllMocks(); mocks.failTable = ''; mocks.queries = []
  mocks.read.mockResolvedValue([{ id: 'g', organizer_id: 'u', reservation_id: 'current', status: 'confirmed', members: [{ id: 'm', user_id: 'u', is_organizer: true, staff_display_name: '幹事表示名', guest_name: '旧名' }], candidate_dates: [], scenario_masters: null }])
  mocks.settings.mockResolvedValue({g: {survey_enabled:true}})
  const rows: Record<string, unknown[]> = {
    reservations: [{id:'current',private_group_id:'g',status:'gm_confirmed',schedule_event_id:'event',gm_staff:'gm',store_id:'old',candidate_datetimes:{candidates:[{status:'confirmed',date:'2020-01-01'}]}}],
    schedule_events: [{id:'event',date:'2027-03-01',start_time:'19:00:00',end_time:'22:00:00',store_id:'new',is_cancelled:false,gms:['変更後の担当','サブ担当']}],
    staff: [{id:'gm',name:'GM'}], stores:[{id:'new',name:'現在店舗'}],
  }
  mocks.from.mockImplementation(table => {
    const query = {table,filters:{} as Record<string,unknown>}; mocks.queries.push(query)
    const builder = {
      select: () => builder,
      eq: (key:string,value:unknown) => {query.filters[key]=value;return builder},
      in: (key:string,value:unknown) => {query.filters[key]=value;return builder},
      then: (resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown) => Promise.resolve(mocks.failTable===table ? {data:null,error:new Error('取得失敗')} : {data:rows[table] || [],error:null}).then(resolve,reject),
    }
    return builder
  })
})
it('uses authorized names and the current reservation event, never the old candidate or customer table', async () => {
  await render();expect(result.current.loading).toBe(false)
  expect(result.current.error).toBeNull()
  expect(result.current.groups[0]).toMatchObject({organizer:{name:'幹事表示名'},confirmed_date:'2027-03-01',confirmed_time:'19:00〜22:00',confirmed_store_name:'現在店舗',confirmed_gm_name:'変更後の担当・サブ担当'})
  expect(mocks.queries.some(q=>q.table==='customers')).toBe(false)
  expect(mocks.queries.every(q=>q.filters.organization_id==='org')).toBe(true)
  expect(mocks.queries.find(q=>q.table==='reservations')?.filters.id).toEqual(['current'])
})
it('reports a lookup failure instead of showing missing names and dates as valid data', async () => {
  mocks.failTable='schedule_events'
  await render();expect(result.current.loading).toBe(false)
  expect(result.current.error).toBe('取得失敗');expect(result.current.groups).toEqual([])
})
it('never falls back to a different reservation when the current link is inconsistent', async () => {
  mocks.read.mockResolvedValue([{id:'g',organizer_id:'u',reservation_id:'different',status:'confirmed',members:[],candidate_dates:[],scenario_masters:null}])
  await render();expect(result.current.loading).toBe(false)
  expect(result.current.groups[0].confirmed_date).toBeUndefined()
  expect(result.current.groups[0].confirmed_warning).toContain('対応を確認できません')
})

it('waits for survey batches before starting reservation batches', async () => {
  let finish!: (value: Record<string, {survey_enabled: boolean}>) => void
  mocks.settings.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await render()
  expect(result.current.loading).toBe(true)
  expect(mocks.from).not.toHaveBeenCalled()
  await act(async () => finish({g: {survey_enabled:true}}))
  expect(result.current.loading).toBe(false)
  expect(mocks.from).toHaveBeenCalledWith('reservations')
})
