// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ save: vi.fn(), ready: vi.fn(), rpc: vi.fn(), toast: vi.fn(), refreshed: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({select:()=>({eq:()=>({maybeSingle:async()=>({data:{status:'pending'},error:null})})})}), rpc:mocks.rpc,
} }))
vi.mock('@/lib/gmResponseApi',()=>({saveGmResponse:mocks.save}))
vi.mock('@/pages/PrivateBookingManagement/utils/privateBookingGmReadiness', () => ({ isReservationReadyForStoreAfterGmResponses: mocks.ready }))
vi.mock('@/utils/toast', () => ({ showToast: { error: mocks.toast, info: vi.fn() } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
import { useResponseSubmit } from './useResponseSubmit'
import type { GMRequest } from './useGMRequests'
let root: Root, host: HTMLDivElement, state: ReturnType<typeof useResponseSubmit>
function Probe() { state = useResponseSubmit({ requests:[{id:'response',staff_id:'staff',updated_at:'2026-09-29T00:00:00Z',reservation_id:'reservation',candidate_datetimes:{candidates:[{order:3},{order:8},{order:2}]}} as GMRequest],selectedCandidates:{response:[3,2]},notes:{},onSubmitSuccess:mocks.refreshed }); return null }
beforeEach(async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); vi.clearAllMocks()
  mocks.save.mockResolvedValue({}); mocks.ready.mockResolvedValue(true); mocks.rpc.mockResolvedValue({data:{success:true},error:null})
  host=document.createElement('div'); root=createRoot(host); await act(async()=>root.render(<Probe/>))
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
it('回答保存後の確認失敗は部分成功を明示して保存済み回答を再取得する', async()=>{
  mocks.ready.mockRejectedValueOnce(new Error('unavailable'))
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('回答は保存済み'))
  expect(mocks.refreshed).toHaveBeenCalledTimes(1);expect(mocks.rpc).not.toHaveBeenCalled()
  expect(state.submitting).toBeNull()
})
it('予約RPCのsuccess:falseも部分成功として扱う', async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{success:false,error:'conflict'},error:null})
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('回答は保存済み'))
  expect(mocks.refreshed).toHaveBeenCalledTimes(1)
})
it('回答保存自体の失敗を保存済みと案内しない', async()=>{
  mocks.save.mockRejectedValueOnce(new Error('回答を保存できませんでした。再度お試しください。'))
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.toast).toHaveBeenCalledWith('回答を保存できませんでした。再度お試しください。')
  expect(mocks.refreshed).not.toHaveBeenCalled();expect(mocks.ready).not.toHaveBeenCalled()
})

it('表示番号に欠番があっても、Discordと同じ候補配列位置を保存する', async()=>{
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({availableCandidates:[0,2],responseStatus:'available',expectedResponse:{id:'response',updated_at:'2026-09-29T00:00:00Z'}}))
})

it('競合時は再選択を案内し、予約状態を更新しない',async()=>{
  mocks.save.mockRejectedValueOnce(new Error('候補日時またはGM回答が変更されました。画面を更新して、選び直してください。'))
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('選び直して'))
  expect(mocks.ready).not.toHaveBeenCalled();expect(mocks.refreshed).not.toHaveBeenCalled()
})
