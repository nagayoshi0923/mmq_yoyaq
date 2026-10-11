// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePublicPrivateBookingSlots } from './usePublicPrivateBookingSlots'

const api = vi.hoisted(() => ({ hours: vi.fn(), blocked: vi.fn(), events: vi.fn(), holidays: vi.fn() }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({
  privateBookingSlotReadApi: { listBusinessHours: api.hours, getPublicAvailability: api.blocked, listAvailabilityEvents: api.events },
  scheduleHookReadApi: { getPublicCustomHolidays: api.holidays },
}))
let root: Root
let client: QueryClient
let getOptions: ReturnType<typeof usePublicPrivateBookingSlots>
async function mount() {
  client = new QueryClient({defaultOptions:{queries:{retry:false,refetchOnMount:false}}})
  api.hours.mockResolvedValue({data:[{store_id:'a', opening_hours:{tuesday:{is_open:true,open_time:'13:00',close_time:'22:00',available_slots:['afternoon','evening'],slot_start_times:{afternoon:'14:00',evening:'19:00'}}}}],error:null})
  api.blocked.mockResolvedValue({data:[],error:null})
  api.events.mockResolvedValue({data:[],error:null})
  api.holidays.mockResolvedValue({data:[{custom_holidays:[]}],error:null})
  function Probe() { getOptions = usePublicPrivateBookingSlots('org',['a'],new Date(2030,0,1)); return null }
  root = createRoot(document.createElement('div'))
  await act(async () => { root.render(createElement(QueryClientProvider,{client},createElement(Probe))); await new Promise(resolve=>setTimeout(resolve,20)) })
  await act(async () => { await new Promise(resolve=>setTimeout(resolve,20)) })
}
afterEach(async()=>{if(root) await act(async()=>root.unmount());client?.clear();vi.clearAllMocks()})
it('公開APIの情報で受付を判定し、範囲外の日付は開放しない',async()=>{
  await mount()
  expect(getOptions('2030-01-08','afternoon')).toEqual([{storeId:'a',startTime:'14:00'}])
  expect(getOptions('2030-01-08','morning')).toEqual([])
  expect(getOptions('2030-02-05','afternoon')).toEqual([])
  expect(api.blocked).toHaveBeenCalledWith({p_organization_id:'org',p_store_ids:['a'],p_start_date:'2030-01-01',p_end_date:'2030-01-31'})
})
it('開いたまま募集停止が更新されたら申込を消す',async()=>{
  await mount()
  api.blocked.mockResolvedValue({data:[{date:'2030-01-08',store_id:'a',time_slot:'afternoon'}],error:null})
  await act(async()=>{await client.invalidateQueries({queryKey:['public-private-slots']});await new Promise(resolve=>setTimeout(resolve,20))})
  expect(getOptions('2030-01-08','afternoon')).toEqual([])
  expect(getOptions('2030-01-08','evening')).toHaveLength(1)
})
it('更新取得に失敗したら古い受付可能データで申込を表示しない',async()=>{
  await mount()
  api.blocked.mockResolvedValue({data:null,error:new Error('unavailable')})
  await act(async()=>{await client.invalidateQueries({queryKey:['public-private-slots']});await new Promise(resolve=>setTimeout(resolve,20))})
  expect(getOptions('2030-01-08','afternoon')).toEqual([])
})
