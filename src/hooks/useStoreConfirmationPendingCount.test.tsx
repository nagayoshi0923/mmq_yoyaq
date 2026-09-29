// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),callbacks:[] as Array<()=>void>,user:{id:'one'},channel:null as any}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:mocks.user,isStaff:true})}))
vi.mock('@/lib/apiClient',()=>({apiClient:{get:mocks.get}}))
vi.mock('@/utils/logger',()=>({logger:{error:vi.fn()}}))
vi.mock('@/lib/supabase',()=>({supabase:{channel:()=>mocks.channel,removeChannel:vi.fn()}}))
import { useStoreConfirmationPendingCount } from './useStoreConfirmationPendingCount'
let root:Root
let value:ReturnType<typeof useStoreConfirmationPendingCount>
function Probe(){value=useStoreConfirmationPendingCount();return null}
beforeEach(()=>{
  vi.clearAllMocks();mocks.callbacks=[];mocks.user={id:'one'}
  mocks.channel={on:(_type:string,_filter:unknown,callback:()=>void)=>{mocks.callbacks.push(callback);return mocks.channel},subscribe:()=>mocks.channel}
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});root=createRoot(document.createElement('div'))
})
afterEach(async()=>{await act(async()=>root.unmount())})
it('取得失敗を0件の正常表示にせず、回答の更新時に回復する',async()=>{
  mocks.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({count:3})
  await act(async()=>root.render(<Probe/>))
  expect(value.error).toBe(true)
  await act(async()=>mocks.callbacks[1]())
  expect(value.error).toBe(false);expect(value.count).toBe(3)
})
it('遅れた古い応答で新しい件数を上書きしない',async()=>{
  let resolveOld!:(value:{count:number})=>void
  mocks.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve})).mockResolvedValue({count:2})
  await act(async()=>root.render(<Probe/>))
  await act(async()=>mocks.callbacks[1]())
  await act(async()=>resolveOld({count:9}))
  expect(value.count).toBe(2)
})
it('別ユーザーへの切替後に前の件数を表示しない',async()=>{
  let resolveNew!:(value:{count:number})=>void
  mocks.get.mockResolvedValueOnce({count:8}).mockImplementationOnce(()=>new Promise(resolve=>{resolveNew=resolve}))
  await act(async()=>root.render(<Probe/>));expect(value.count).toBe(8)
  mocks.user={id:'two'};await act(async()=>root.render(<Probe/>));expect(value.count).toBe(0)
  await act(async()=>resolveNew({count:1}));expect(value.count).toBe(1)
})
