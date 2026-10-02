// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({writes:[] as any[],fail:false,sends:0,emailFalse:false,omitFinal:false}))
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>{
 const result=()=>({data:table==='schedule_events_public'?{organization_id:'org',max_participants:8,current_participants:0}:table==='organization_scenarios_with_master'?{participation_fee:4500}: {id:'customer',phone:'09012345678'},error:null})
 const chain:any={select:()=>chain,eq:()=>chain,update:()=>chain,single:async()=>result(),maybeSingle:async()=>result(),then:(r:any)=>Promise.resolve(result()).then(r)};return chain
},rpc:async(name:string)=>({data:name==='get_performance_booking_window'?[{effective_booking_deadline:'2099-01-01T00:00:00Z'}]:[],error:null}),functions:{invoke:async()=>{state.sends++;return {data:{success:!state.emailFalse},error:null}}}}}))
vi.mock('@/lib/reservationApi',()=>({reservationApi:{create:async(p:any)=>{state.writes.push(p);await Promise.resolve();if(state.fail)throw Error('offline');return {id:'reservation',reservation_number:p.reservation_number,final_price:state.omitFinal?undefined:8000}}}}))
vi.mock('@/lib/analytics',()=>({trackReservationComplete:vi.fn()}))
import {useBookingSubmit} from './useBookingSubmit'
let root:Root,host:HTMLDivElement,hook:ReturnType<typeof useBookingSubmit>
function Fixture(){hook=useBookingSubmit({eventId:'event',scenarioId:'scenario',scenarioTitle:'作品',storeId:'store',eventDate:'2098-10-01',startTime:'10:00',endTime:'13:00',storeName:'店舗',participationFee:1,currentParticipants:0,userId:'user'});return null}
const submit=()=>hook.handleSubmit('顧客','qa@example.invalid','09012345678',2,'')
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});state.writes=[];state.sends=0;state.fail=false;state.emailFalse=false;state.omitFinal=false;host=document.createElement('div');root=createRoot(host);await act(async()=>root.render(<QueryClientProvider client={new QueryClient()}><Fixture/></QueryClientProvider>))})
afterEach(async()=>{await act(async()=>root.unmount())})
it('同一tickの二重送信と成功後の再送を止め、サーバー金額を使う',async()=>{await act(async()=>{await Promise.all([submit(),submit()])});await act(async()=>submit());expect(state.writes).toHaveLength(1);expect(state.sends).toBe(1);expect(hook.completedReservation?.totalPrice).toBe(8000)})
it('保存失敗後は同じ予約番号で再試行できる',async()=>{state.fail=true;await act(async()=>{await expect(submit()).rejects.toThrow('offline')});state.fail=false;await act(async()=>submit());expect(state.writes).toHaveLength(2);expect(state.writes[0].reservation_number).toBe(state.writes[1].reservation_number);expect(state.sends).toBe(1);expect(hook.success).toBe(true)})
it('HTTP成功でも通知success=falseを保存成功と区別する',async()=>{state.emailFalse=true;await act(async()=>submit());expect(hook.success).toBe(true);expect(hook.confirmationEmailOutcome).toEqual({status:'failed',reason:'unsuccessful_response'})})

it('server金額欠落時も再取得単価を使い古いprops単価を使わない',async()=>{state.omitFinal=true;await act(async()=>submit());expect(hook.completedReservation?.totalPrice).toBe(9000)})
