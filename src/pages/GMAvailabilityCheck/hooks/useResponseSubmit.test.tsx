// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ save: vi.fn(), ready: vi.fn(), rpc: vi.fn(), toast: vi.fn(), refreshed: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => table === 'gm_availability_responses'
    ? { update: () => ({ eq: mocks.save }) }
    : { select: () => ({ eq: () => ({ maybeSingle: async () => ({data:{status:'pending'},error:null}) }) }) },
  rpc: mocks.rpc,
} }))
vi.mock('@/pages/PrivateBookingManagement/utils/privateBookingGmReadiness', () => ({ isReservationReadyForStoreAfterGmResponses: mocks.ready }))
vi.mock('@/utils/toast', () => ({ showToast: { error: mocks.toast, info: vi.fn() } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
import { useResponseSubmit } from './useResponseSubmit'
import type { GMRequest } from './useGMRequests'
let root: Root, host: HTMLDivElement, state: ReturnType<typeof useResponseSubmit>
function Probe() { state = useResponseSubmit({ requests:[{id:'response',reservation_id:'reservation'} as GMRequest],selectedCandidates:{response:[1]},notes:{},onSubmitSuccess:mocks.refreshed }); return null }
beforeEach(async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); vi.clearAllMocks()
  mocks.save.mockResolvedValue({error:null}); mocks.ready.mockResolvedValue(true); mocks.rpc.mockResolvedValue({data:{success:true},error:null})
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
  mocks.save.mockResolvedValueOnce({error:{message:'denied'}})
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.toast).toHaveBeenCalledWith('回答を保存できませんでした。再度お試しください。')
  expect(mocks.refreshed).not.toHaveBeenCalled();expect(mocks.ready).not.toHaveBeenCalled()
})
it('通常成功時は予約更新と再取得が走る', async()=>{
  await act(async()=>state.handleSubmit('response'))
  expect(mocks.ready).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect(mocks.refreshed).toHaveBeenCalledTimes(1)
  expect(mocks.toast).not.toHaveBeenCalled()
})
