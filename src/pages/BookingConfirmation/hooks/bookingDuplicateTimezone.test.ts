import {expect,it,vi} from 'vitest'
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>{let joined=false;const chain:any={select:(s:string)=>{joined=s.includes('schedule_events!');return chain},eq:()=>chain,in:()=>chain,neq:()=>chain,limit:()=>chain,then:(resolve:any)=>Promise.resolve({data:joined?[{id:'existing',schedule_events:{date:'2098-10-01',start_time:'10:00',end_time:'13:00'}}]:[],error:null}).then(resolve)};return chain}}}))
import {checkDuplicateReservation} from './useBookingSubmit'
it('同日の同時刻公演は端末のタイムゾーンに依存せず重複と判定する',async()=>{expect(await checkDuplicateReservation('new','qa@example.invalid',undefined,'2098-10-01','10:00')).toMatchObject({hasDuplicate:true,isTimeConflict:true})})
it('同日の離れた時刻は重複しない',async()=>{expect(await checkDuplicateReservation('new','qa@example.invalid',undefined,'2098-10-01','18:00')).toEqual({hasDuplicate:false})})
