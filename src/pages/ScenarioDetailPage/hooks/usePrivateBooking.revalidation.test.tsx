// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({state:{availability:{slotsByDate:{},unavailableReasons:{}} as {slotsByDate:Record<string,unknown[]>;unavailableReasons:Record<string,string>},loading:false,ready:true,error:null,reload:()=>{}},target:vi.fn(),warning:vi.fn(),save:vi.fn()}))
vi.mock('@/hooks/useUserPreference',()=>({usePrivateBookingStorePreference:()=>[['store'],m.save],useStoreFilterPreference:()=>[[]]}))
vi.mock('@/hooks/useCandidateSlotAvailability',()=>({useCandidateSlotAvailability:(target:unknown)=>{m.target(target);return m.state}}))
vi.mock('@/utils/toast',()=>({showToast:{warning:m.warning}}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
import{usePrivateBooking}from'./usePrivateBooking'
let root:Root,result:ReturnType<typeof usePrivateBooking>
const stores=[{id:'store',status:'active',ownership_type:'store',is_temporary:false}]
function Fixture(){result=usePrivateBooking({events:[],stores,scenarioId:'scenario',organizationId:'org'});return null}
afterEach(async()=>{await act(async()=>root?.unmount())})
const slot={key:'afternoon',label:'午後',startTime:'13:00',endTime:'16:00'}
it('DB の空き判定が読めるまでは選択を保持し、読めた後に選べなくなった枠だけ削除する',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 m.state={...m.state,availability:{slotsByDate:{'2030-01-01':[slot]},unavailableReasons:{}},ready:true}
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>))
 expect(m.target).toHaveBeenLastCalledWith({kind:'scenario',organizationId:'org',scenarioId:'scenario',storeIds:['store']})
 expect(result.getTimeSlotsForDate('2030-01-01')).toEqual([{label:'午後',startTime:'13:00',endTime:'16:00'}])
 await act(async()=>result.setSelectedTimeSlots([{date:'2030-01-01',slot:{label:'午後',startTime:'13:00',endTime:'16:00'}},{date:'2030-02-01',slot:{label:'夜',startTime:'19:00',endTime:'22:00'}}]))
 m.state={...m.state,availability:{slotsByDate:{'2030-01-01':[slot]},unavailableReasons:{'2030-01-01-午後':'他の公演と重なります'}},ready:false,loading:true}
 await act(async()=>root.render(<Fixture/>))
 expect(result.selectedTimeSlots).toHaveLength(2);expect(result.isAvailabilityReady).toBe(false);expect(m.warning).not.toHaveBeenCalled()
 m.state={...m.state,ready:true,loading:false};await act(async()=>root.render(<Fixture/>))
 // 読み込んだ月の外の候補（2/1）は残す
 expect(result.selectedTimeSlots.map(s=>s.date)).toEqual(['2030-02-01']);expect(m.warning).toHaveBeenCalledTimes(1)
})
