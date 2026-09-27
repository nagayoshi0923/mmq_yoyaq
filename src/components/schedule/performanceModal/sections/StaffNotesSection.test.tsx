// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { StaffNotesSection } from './StaffNotesSection'
import type { EventFormData } from '@/types/schedule'
const writes=vi.hoisted(()=>({from:vi.fn(),remove:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{from:writes.from}}))
vi.mock('@/lib/reservationApi',()=>({reservationApi:{delete:writes.remove}}))
vi.mock('@/lib/organization',()=>({getCurrentOrganizationId:async()=> 'org'}))
vi.mock('@/components/ui/multi-select',()=>({MultiSelect:()=>null}))
vi.mock('@/components/ui/popover',()=>({Popover:({children}:{children:ReactNode})=><>{children}</>,PopoverTrigger:({children}:{children:ReactNode})=><>{children}</>,PopoverContent:({children}:{children:ReactNode})=><>{children}</>}))
vi.mock('@/components/ui/radio-group',()=>({RadioGroup:({value,onValueChange}:{value:string,onValueChange:(value:string)=>void})=><select aria-label="役割" value={value} onChange={e=>onValueChange(e.target.value)}><option value="main">GM</option><option value="staff">スタッフ参加</option></select>,RadioGroupItem:()=>null}))
let root:Root, container:HTMLDivElement, latest:EventFormData
function Harness({role='main',confirmed=[]}:{role?:string,confirmed?:string[]}) {
 const [formData,setFormData]=useState<EventFormData>({date:'2026-10-01',venue:'store',start_time:'10:00',end_time:'12:00',max_participants:6,capacity:6,category:'open',gms:['Staff A'],gmRoles:{'Staff A':role},scenario:'Scenario',notes:''})
 latest=formData
 // edit modeの旧実装でも同じ操作を再現できる入力を保持する。
 const props={CATEGORY_TONE:{},formData,setFormData,staff:[],scenarios:[],allAvailableStaff:[],staffParticipantsFromDB:confirmed,setIsStaffModalOpen:vi.fn(),mode:'edit' as const,event:{id:'event'},setStaffParticipantsFromDB:vi.fn()}
 return <StaffNotesSection {...props}/>
}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();container=document.createElement('div');root=createRoot(container)})
afterEach(async()=>{await act(async()=>root.unmount())})
async function changeRole(role:string){await act(async()=>{const select=container.querySelector('select')!;select.value=role;select.dispatchEvent(new Event('change',{bubbles:true}))})}
describe('スタッフ参加は保存まで予約を変更しない',()=>{
 it('役割を参加へ変えても予約を作らず、参加予定として表示する',async()=>{
  await act(async()=>root.render(<Harness/>));await changeRole('staff')
  expect(latest.gmRoles?.['Staff A']).toBe('staff');expect(container.textContent).toContain('(参加予定)')
  expect(writes.from).not.toHaveBeenCalled();expect(writes.remove).not.toHaveBeenCalled()
 })
 it('登録済み参加者の役割解除と担当削除だけでは予約を削除しない',async()=>{
  await act(async()=>root.render(<Harness role="staff" confirmed={['Staff A']}/>));await changeRole('main')
  expect(latest.gmRoles?.['Staff A']).toBe('main')
  await act(async()=>{container.querySelector<HTMLElement>('[aria-label="Staff Aを担当から外す"]')!.click()})
  expect(latest.gms).toEqual([]);expect(writes.from).not.toHaveBeenCalled();expect(writes.remove).not.toHaveBeenCalled()
 })
 it('スタッフ参加の担当チップを直接外しても予約を削除しない',async()=>{
  await act(async()=>root.render(<Harness role="staff" confirmed={['Staff A']}/>))
  await act(async()=>{container.querySelector<HTMLElement>('[aria-label="Staff Aを担当から外す"]')!.click()})
  expect(latest.gms).toEqual([]);expect(writes.from).not.toHaveBeenCalled();expect(writes.remove).not.toHaveBeenCalled()
 })
})
