import type { ScheduleEvent } from '../../src/types/schedule'
export const original: ScheduleEvent = { id:'00000000-0000-4000-8000-000000000001', date:'2027-01-16', venue:'store', store_id:'store', scenario:'', category:'private', start_time:'19:00', end_time:'22:00', gms:[], is_cancelled:false, reservation_id:'fixture-reservation', is_private_booking:true }
export const fixtureState = { mode:'invoke_error', saved:0, sent:0, reservationRead:0 }
export const scheduleApi = {
 update: async (_id:string, data:Record<string,unknown>) => {
  if(fixtureState.mode==='save_error') throw Error('fixture save error')
  fixtureState.saved++; return { ...original,...data }
 },
 create: async () => { throw Error('fixture: unexpected create') },
}
export const reservationApi = { syncStaffReservations: async () => undefined }
export const usePreparationSettings = () => ({ fetch: async () => () => 0 })
export const loadPreparationNeighborEvents = async () => []
export const fetchEventSnapshot = async () => null
export const createEventHistory = async () => undefined
export const supabase = {
 from: (table:string) => {
  const query = {
   select: () => query, eq: () => query,
   single: async () => ({ data: table==='stores' ? { id:'store', name:'試験店舗' } : original,error:null }),
   maybeSingle: async () => {
    fixtureState.reservationRead++
    return fixtureState.mode==='read_error' ? { data:null,error:{message:'fixture read error'} } : { data:{ id:'fixture-reservation',organization_id:'fixture-org',reservation_number:'LOCAL-TEST',customer_email:fixtureState.mode==='missing_email'?null:'fixture@example.invalid',customer_name:'試験顧客',display_customer_name:'旧表示名',schedule_events:original },error:null }
   },
  }
  return query
 },
 rpc: async () => { if(fixtureState.mode==='save_error')return {error:{message:'fixture save error'}};fixtureState.saved++;return {data:true,error:null} },
 functions: { invoke: async () => {
  fixtureState.sent++
  if(fixtureState.mode==='invoke_throw') throw Error('fixture disconnected')
  if(fixtureState.mode==='invoke_error') return {data:null,error:{message:'fixture provider error'}}
  if(fixtureState.mode==='business_false') return {data:{success:false},error:null}
  return {data:{success:true,emailId:'fixture-receipt'},error:null}
 } },
}

export const RESERVATION_WITH_CUSTOMER_SELECT_FIELDS = 'fixture-select'
