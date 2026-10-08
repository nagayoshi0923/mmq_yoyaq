// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({timing:vi.fn(),events:vi.fn(),hours:vi.fn(),blocked:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
vi.mock('@/lib/privateBookingScenarioTime',()=>({fetchScenarioTimingFromDb:m.timing,isWithinScenarioPerformancePeriod:()=>true}))
vi.mock('@/lib/api/scheduleHookReadApi',()=>({privateBookingSlotReadApi:{listAvailabilityEvents:m.events,listBusinessHours:m.hours,getPublicAvailability:m.blocked}}))
vi.mock('@/utils/logger',()=>({logger:{error:vi.fn()}}))
import {usePrivateBookingSlotData} from './usePrivateBookingSlotData'
let root:Root,result:ReturnType<typeof usePrivateBookingSlotData>
const stores=['store'];const holiday=()=>false
function Fixture({scenario='one',selectedStores=stores}:{scenario?:string,selectedStores?:string[]}){result=usePrivateBookingSlotData({organizationId:'org',scenarioId:scenario,storeIds:selectedStores,isActive:true,isCustomHoliday:holiday});return null}
afterEach(async()=>{await act(async()=>root?.unmount())})
it('時間RPC失敗は読み込み完了でも再検証可とせず、成功した再取得で回復する',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 for(const mock of[m.events,m.hours,m.blocked])mock.mockResolvedValue({data:[],error:null})
 m.timing.mockResolvedValue({duration:180,title:'架空作品'})
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>))
 expect(result.loading).toBe(false);expect(result.canRevalidate).toBe(true)
 m.timing.mockRejectedValue(Error('read unavailable'));await act(async()=>root.render(<Fixture scenario="two"/>))
 expect(result.loading).toBe(false);expect(result.canRevalidate).toBe(false);expect(result.computeSlotsByDate(['2030-01-01'])).toEqual({})
 m.timing.mockResolvedValue({duration:180,title:'架空作品'});await act(async()=>root.render(<Fixture scenario="three"/>))
 expect(result.canRevalidate).toBe(true)
})

it('店舗切替後に破棄済み取得が失敗しても成功した現店舗の申込を止めない',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 let rejectEvents:(error:Error)=>void=()=>{},rejectHours:(error:Error)=>void=()=>{}
 m.events.mockReturnValueOnce(new Promise((_resolve,reject)=>{rejectEvents=reject})).mockResolvedValue({data:[],error:null})
 m.hours.mockReturnValueOnce(new Promise((_resolve,reject)=>{rejectHours=reject})).mockResolvedValue({data:[],error:null})
 m.blocked.mockResolvedValue({data:[],error:null});m.timing.mockResolvedValue({duration:180,title:'架空作品'})
 const before=['before'],after=['after'];root=createRoot(document.createElement('div'))
 await act(async()=>root.render(<Fixture selectedStores={before}/>))
 await act(async()=>root.render(<Fixture selectedStores={after}/>))
 expect(result.canRevalidate).toBe(true)
 await act(async()=>{rejectEvents(Error('old events failed'));rejectHours(Error('old hours failed'));await Promise.resolve()})
 expect(result.canRevalidate).toBe(true);expect(result.loading).toBe(false)
})
