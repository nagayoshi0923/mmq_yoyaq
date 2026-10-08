// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({ready:true,compute:vi.fn(),warning:vi.fn(),save:vi.fn()}))
vi.mock('@/hooks/useUserPreference',()=>({usePrivateBookingStorePreference:()=>[['store'],m.save],useStoreFilterPreference:()=>[[]]}))
vi.mock('@/hooks/usePrivateBookingSlotData',()=>({usePrivateBookingSlotData:()=>({loading:false,canRevalidate:m.ready,computeSlotsByDate:m.compute,isCandidateBlockedOnAllStores:()=>false})}))
vi.mock('@/utils/toast',()=>({showToast:{warning:m.warning}}))
import{usePrivateBooking}from'./usePrivateBooking'
let root:Root,result:ReturnType<typeof usePrivateBooking>
const stores=[{id:'store',status:'active',ownership_type:'store',is_temporary:false}]
function Fixture(){result=usePrivateBooking({events:[],stores,scenarioId:'scenario',organizationId:'org'});return null}
afterEach(async()=>{await act(async()=>root?.unmount())})
it('取得失敗相当では選択を保持し送信を許可せず、正常再取得の条件変更だけ削除する',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.ready=true
 m.compute.mockReturnValue({'2030-01-01':[{label:'昼',startTime:'13:00',endTime:'16:00'}]})
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>))
 await act(async()=>result.setSelectedTimeSlots([{date:'2030-01-01',slot:{label:'昼',startTime:'13:00',endTime:'16:00'}}]))
 m.ready=false;m.compute.mockReturnValue({});await act(async()=>root.render(<Fixture/>))
 expect(result.selectedTimeSlots).toHaveLength(1);expect(result.isAvailabilityReady).toBe(false);expect(m.warning).not.toHaveBeenCalled()
 expect(await result.checkTimeSlotAvailability('2030-01-01',result.selectedTimeSlots[0].slot)).toBe(false)
 m.ready=true;await act(async()=>root.render(<Fixture/>))
 expect(result.selectedTimeSlots).toHaveLength(0);expect(m.warning).toHaveBeenCalledTimes(1)
})
