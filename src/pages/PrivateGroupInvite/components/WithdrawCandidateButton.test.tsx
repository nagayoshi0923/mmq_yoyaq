// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WithdrawCandidateButton } from './WithdrawCandidateButton'
const mocks = vi.hoisted(() => ({ withdraw: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/privateGroupCandidateDates', () => ({ withdrawPrivateGroupCandidate: mocks.withdraw }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
const candidate = { id:'candidate',group_id:'group',date:'2026-12-05',time_slot:'夜間' as const,start_time:'19:00',end_time:'23:00',order_num:1,created_at:'' }
let root: Root
let host: HTMLDivElement
const updated = vi.fn()
const button = (text: string) => [...document.querySelectorAll('button')].find(node=>node.textContent===text)!
const render = () => act(async()=>root.render(<WithdrawCandidateButton groupId="group" candidate={candidate} onWithdrawn={updated} />))
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.clearAllMocks()})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
it('二段階確認の途中で取消でき、取消では保存しない',async()=>{
 await render();await act(async()=>button('削除').click())
 expect(document.body.textContent).toContain('これまでの回答は履歴として残り')
 await act(async()=>button('次へ').click());expect(button('削除する')).toBeDefined()
 await act(async()=>button('キャンセル').click());expect(mocks.withdraw).not.toHaveBeenCalled()
})
it('最後の確認だけで一度保存し、処理中の取消と連打を防ぐ',async()=>{
 let resolve!:()=>void;mocks.withdraw.mockReturnValueOnce(new Promise<void>(r=>{resolve=r}))
 await render();await act(async()=>button('削除').click());await act(async()=>button('次へ').click())
 await act(async()=>{button('削除する').click();button('削除する').click()})
 expect(mocks.withdraw).toHaveBeenCalledExactlyOnceWith('group','candidate')
 expect(button('キャンセル').disabled).toBe(true)
 await act(async()=>resolve());expect(updated).toHaveBeenCalledTimes(1);expect(mocks.success).toHaveBeenCalledTimes(1)
})
it('競合エラーでは成功扱いせず確認を残す',async()=>{
 mocks.withdraw.mockRejectedValueOnce(new Error('既に申込済みです'))
 await render();await act(async()=>button('削除').click());await act(async()=>button('次へ').click());await act(async()=>button('削除する').click())
 expect(mocks.error).toHaveBeenCalledWith('既に申込済みです');expect(updated).not.toHaveBeenCalled();expect(button('削除する')).toBeDefined()
})
