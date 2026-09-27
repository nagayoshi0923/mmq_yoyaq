// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({read:vi.fn(),search:vi.fn(),manage:vi.fn()}))
vi.mock('@/lib/privateGroupInvitations',()=>({readPrivateGroupInvitations:mocks.read,searchPrivateGroupInvitee:mocks.search,managePrivateGroupInvitation:mocks.manage}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'actor'}})}))
vi.mock('@/utils/logger',()=>({logger:{error:vi.fn()}}))
import { UserSearchInvite } from './UserSearchInvite'
let root:Root, container:HTMLDivElement
const row=(email:string)=>({id:'invite',group_id:'g',invited_user_id:'target',invited_email:email,invited_by:'actor',status:'pending',created_at:'2026-01-01T00:00:00+09:00',responded_at:null})
const render=async(groupId='g')=>act(async()=>root.render(<UserSearchInvite groupId={groupId} inviteCode="fixture" members={[]}/>))
const click=async(label:string)=>{const b=[...container.querySelectorAll('button')].find(x=>x.textContent===label);expect(b).toBeTruthy();await act(async()=>b!.click())}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();mocks.read.mockResolvedValue([]);mocks.manage.mockResolvedValue(undefined);container=document.createElement('div');document.body.append(container);root=createRoot(container)})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})
it('shows failed history separately from no invitations and retries',async()=>{
 mocks.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([row('restored@example.invalid')])
 await render();expect(container.textContent).toContain('招待履歴を取得できません');expect(container.textContent).not.toContain('まだ招待を送信していません')
 await click('再試行');expect(container.textContent).toContain('restored@example.invalid');expect(container.querySelector('[role=alert]')).toBeNull()
})
it('discards an old group history response',async()=>{
 let resolve!:(v:unknown)=>void;mocks.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValueOnce([row('new@example.invalid')])
 await render('old');await render('new');await act(async()=>resolve([row('old@example.invalid')]))
 expect(container.textContent).toContain('new@example.invalid');expect(container.textContent).not.toContain('old@example.invalid')
})
it('surfaces cancellation failure without reporting an empty successful history',async()=>{
 mocks.read.mockResolvedValue([row('pending@example.invalid')]);mocks.manage.mockRejectedValue(new Error('回答済みの招待は取り消せません'))
 await render();await click('取消');expect(mocks.manage).toHaveBeenCalledWith('g','cancel','invite');expect(container.textContent).toContain('回答済みの招待は取り消せません');expect(container.textContent).not.toContain('まだ招待を送信していません')
})
