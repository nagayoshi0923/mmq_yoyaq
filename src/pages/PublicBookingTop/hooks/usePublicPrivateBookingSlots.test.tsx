// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePublicPrivateBookingSlots } from './usePublicPrivateBookingSlots'

const api = vi.hoisted(() => ({ hours: vi.fn(), blocked: vi.fn(), events: vi.fn(), holidays: vi.fn(), horizon: vi.fn() }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({
  privateBookingSlotReadApi: { listBusinessHours: api.hours, getPublicAvailability: api.blocked, listAvailabilityEvents: api.events, getEffectiveHorizonDays: api.horizon },
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
  if (!api.horizon.getMockImplementation()) api.horizon.mockResolvedValue({data:180,error:null})
  function Probe() { getOptions = usePublicPrivateBookingSlots('org',['a'],new Date(2030,0,1)); return null }
  root = createRoot(document.createElement('div'))
  await act(async () => { root.render(createElement(QueryClientProvider,{client},createElement(Probe))); await new Promise(resolve=>setTimeout(resolve,20)) })
  await act(async () => { await new Promise(resolve=>setTimeout(resolve,20)) })
}
// 申し込める範囲（今日から N 日先）は日本時間の今日で決まるので、今日を 2029-12-01 に固定する（2030-01-08 は 38 日先）
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2029-12-01T10:00:00+09:00'))})
afterEach(async()=>{if(root) await act(async()=>root.unmount());client?.clear();vi.resetAllMocks();vi.useRealTimers()})
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
it('申し込める範囲（既定 180 日）より先の日は申込枠を出さない: 181 日目は出ず 180 日目は出る',async()=>{
  // 2030-01-08（火）が今日から 180 日目・181 日目になるように今日を動かす
  vi.setSystemTime(new Date('2029-07-12T10:00:00+09:00')) // 2030-01-08 は 180 日目
  await mount()
  expect(api.horizon).toHaveBeenCalledWith({organizationId:'org',scenarioId:null})
  expect(getOptions('2030-01-08','afternoon')).toEqual([{storeId:'a',startTime:'14:00'}])
  await act(async()=>{root.unmount()})
  vi.setSystemTime(new Date('2029-07-11T10:00:00+09:00')) // 2030-01-08 は 181 日目
  await mount()
  expect(getOptions('2030-01-08','afternoon')).toEqual([])
  expect(getOptions.horizonDays).toBe(180)
  expect(getOptions.horizonEnd).toBe('2030-01-07')
})
it('設定を 90 日に変えると 91 日目の申込枠を出さない（90 日目は出る）',async()=>{
  api.horizon.mockResolvedValue({data:90,error:null})
  vi.setSystemTime(new Date('2029-10-10T10:00:00+09:00')) // 2030-01-08 は 90 日目
  await mount()
  expect(getOptions('2030-01-08','afternoon')).toEqual([{storeId:'a',startTime:'14:00'}])
  await act(async()=>{root.unmount()})
  vi.setSystemTime(new Date('2029-10-09T10:00:00+09:00')) // 2030-01-08 は 91 日目
  await mount()
  expect(getOptions('2030-01-08','afternoon')).toEqual([])
  expect(getOptions.horizonDays).toBe(90)
})
it('範囲を読めないときは既定の 180 日で開放せず、範囲内の日も申込枠を出さない（Codex 点検 不具合 5）',async()=>{
  api.horizon.mockResolvedValue({data:null,error:new Error('not found')})
  await mount()
  // 2030-01-08 は今日（2029-12-01）から 38 日先。組織が 90 日でも範囲内だが、範囲を読めないので出さない
  expect(getOptions('2030-01-08','afternoon')).toEqual([])
  expect(getOptions.horizonDays).toBe(null)
  // 再試行（次の読み直し）で読めたら出す
  api.horizon.mockResolvedValue({data:90,error:null})
  await act(async()=>{await client.invalidateQueries({queryKey:['public-private-slots']});await new Promise(resolve=>setTimeout(resolve,20))})
  expect(getOptions('2030-01-08','afternoon')).toEqual([{storeId:'a',startTime:'14:00'}])
  expect(getOptions.horizonDays).toBe(90)
})
it('読めたが設定が無い（null）ときだけ既定の 180 日',async()=>{
  api.horizon.mockResolvedValue({data:null,error:null})
  vi.setSystemTime(new Date('2029-07-11T10:00:00+09:00'))
  await mount()
  expect(getOptions('2030-01-08','afternoon')).toEqual([])
  expect(getOptions.horizonDays).toBe(180)
})
