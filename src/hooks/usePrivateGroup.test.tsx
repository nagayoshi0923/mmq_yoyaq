// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import { usePrivateGroup } from './usePrivateGroup'
const rpc=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/supabase',()=>({supabase:{rpc}}))
vi.mock('@/lib/privateGroupRead',()=>({readPrivateGroup:vi.fn(),readPrivateGroupList:vi.fn()}))
vi.mock('@/lib/organization',()=>({resolveOrgIdFromPageContext:vi.fn()}))
vi.mock('@/utils/logger',()=>({logger:{log:vi.fn(),error:vi.fn()}}))
let root:Root
let result:ReturnType<typeof usePrivateGroup>
function Harness(){result=usePrivateGroup();return null}
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();rpc.mockResolvedValue({error:null})
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Harness/>))
})
afterEach(async()=>{await act(async()=>root.unmount())})
describe('退出・メンバー削除の認証付き保存',()=>{
 it('削除は認証付きRPCだけを使用する',async()=>{
  await act(async()=>result.removeMember('member'))
  expect(rpc).toHaveBeenCalledExactlyOnceWith('private_group_remove_member',{p_member_id:'member'})
  expect(result.loading).toBe(false);expect(result.error).toBeNull()
 })
 it('退出の本人判定をサーバーへ渡し、ユーザーIDをクライアントから指定しない',async()=>{
  await act(async()=>result.leaveGroup('group'))
  expect(rpc).toHaveBeenCalledExactlyOnceWith('private_group_leave',{p_group_id:'group'})
 })
 it('拒否・保存失敗を呼出元へ伝え、読み込み中状態を解除する',async()=>{
  const error={code:'42501',message:'退出不可'};rpc.mockResolvedValue({error})
  await act(async()=>{await expect(result.leaveGroup('group')).rejects.toEqual(error)})
  expect(result.loading).toBe(false);expect(result.error).toBe('退出不可')
 })
})

describe('申込前グループ取消',()=>{
 it('グループIDだけを認証付き専用RPCへ渡す',async()=>{
  rpc.mockResolvedValue({data:true,error:null})
  await act(async()=>result.cancelUnrequestedGroup('group'))
  expect(rpc).toHaveBeenCalledExactlyOnceWith('cancel_unrequested_private_group',{p_group_id:'group'})
  expect(result.loading).toBe(false);expect(result.error).toBeNull()
 })
 it.each([{code:'22023',message:'有効な予約があります'}, {code:'55P03',message:'lock'}])('拒否の理由をUIへ伝える %j',async error=>{
  rpc.mockResolvedValue({data:null,error})
  const text=error.code==='55P03'?'ほかの操作が進行中です。画面を更新してからお試しください。':error.message
  await act(async()=>{await expect(result.cancelUnrequestedGroup('group')).rejects.toThrow(text)})
  expect(result.error).toBe(text);expect(result.loading).toBe(false)
 })
 it('成功未確認を成功表示しない',async()=>{
  rpc.mockResolvedValue({data:false,error:null})
  await act(async()=>{await expect(result.cancelUnrequestedGroup('group')).rejects.toThrow('確認できませんでした')})
 })
})
