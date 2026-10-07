import { type ReactNode } from 'react'
export const state = { mode: 'accepted', writes: 0, sends: 0, payload: null as any, assignments: [] as any[] }
const stored = JSON.parse(localStorage.getItem('qa-assignments') || '[]')
state.assignments = stored
export function useAuth() { return { user: state.mode === 'signed-out' ? null : { id: 'qa-user', email: 'qa@example.invalid' }, loading: false, isAdmin: false, isStaff: true } }
export const getCurrentOrganizationId = async () => 'qa-org'
export const AppLayout = ({children}: {children: ReactNode}) => <main>{children}</main>
export const Header = () => null
export const NavigationBar = () => null
export const InviteShareButton = () => null
export function useBookingCoupon() { return { availableCoupons: [], selectedCouponId: null, setSelectedCouponId() {}, couponReady: true, couponDiscount: 0, couponPreview: {}, resetAfterFailure() {} } }
export const assignmentApi = {
 async getAllStaffAssignments() { if(state.mode==='load-error') throw Error('offline'); return state.assignments },
 async updateStaffAssignments(_id: string, records: any[]) { state.writes++; if(state.mode==='forbidden') throw new ApiClientError(403,{}); if(state.mode==='expired') throw new ApiClientError(401,{}); if(state.mode==='offline') throw Error('offline'); state.assignments = records.map(r=>({...r,scenario_master_id:r.scenarioId})); localStorage.setItem('qa-assignments',JSON.stringify(state.assignments)) }
}
export const supabase = {
 from(table: string) {
  let columns = '', updating = false
  const result = () => {
   if(table==='staff') return {data:{id:'qa-staff',name:'QA担当'},error:null}
   if(table==='organization_scenarios_with_master') return {data: columns.includes('gm_count') ? [{scenario_master_id:'qa-scenario',title:'QA作品',author:'QA',gm_count:1}] : {participation_fee:4500,participation_costs:[]},error:null}
   if(table==='schedule_events_public') return {data:{organization_id:'qa-org',max_participants:8,capacity:8,current_participants: state.mode==='sold-out'?8:state.mode==='seat-race'?7:0,reservation_deadline_hours:0},error:state.mode==='read-error'?{message:'offline'}:null}
   if(table==='customers') return {data: updating?null:[{id:'qa-customer',name:'QA顧客',email:'qa@example.invalid',phone:'09012345678',organization_id:'qa-org'}],error:null}
   if(table==='reservations') {const saved=localStorage.getItem('qa-reservation');return {data:columns.includes('schedule_events!')?[]:saved?[JSON.parse(saved)]:[],error:null}}
   throw Error('Unexpected table '+table)
  }
  const chain:any = {select(v:string){columns=v;return chain},eq(){return chain},neq(){return chain},in(){return chain},limit(){return chain},order(){return chain},update(){updating=true;return chain},single:async()=>{const r=result();return table==='customers'&&Array.isArray(r.data)?{...r,data:r.data[0]}:r},maybeSingle:async()=>{const r=result();return table==='customers'&&Array.isArray(r.data)?{...r,data:r.data[0]}:r},then(resolve:any){return Promise.resolve(result()).then(resolve)}}
  return chain
 },
 rpc:async(name:string)=>({data:name==='get_performance_booking_window'?[{effective_booking_deadline:'2099-01-01T00:00:00Z'}]:[],error:null}),
 functions:{async invoke(){state.sends++;if(state.mode==='email-throw')throw Error('offline');return {data:{success:state.mode!=='email-false',skipped:state.mode==='email-skip'},error:state.mode==='email-error'?{message:'offline'}:null}}}
}
export const reservationApi = { async create(payload:any) {state.writes++;state.payload=payload;await new Promise(r=>setTimeout(r,80));if(state.mode==='offline')throw Error('通信に失敗しました');if(state.mode==='server-race')throw Error('残席が足りません');localStorage.setItem('qa-reservation',JSON.stringify({...payload,id:'qa-reservation'}));return {id:'qa-reservation',reservation_number:payload.reservation_number,final_price:8000,discount_amount:1000}} }
export const resolveOrganizationFromPathSegment = async () => ({id:'qa-org',slug:'qa-org'})
export const apiClient = {get:async()=>[],post:async()=>({success:true})}
export class ApiClientError extends Error { constructor(public status:number,public body:any){super(body.message||'error')} }

export const RESERVATION_WITH_CUSTOMER_SELECT_FIELDS = 'fixture-select'
