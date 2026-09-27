// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),reservations:vi.fn(),options:vi.fn(),restore:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
vi.mock('@/lib/customerPlayHistory',()=>({customerPlayHistory:{snapshot:mocks.snapshot}}))
vi.mock('@/lib/api/customerApi',()=>({customerApi:{reservationHistory:mocks.reservations,playedScenarioOptions:mocks.options}}))
vi.mock('@/lib/playedOverrides',()=>({addPlayedOverride:vi.fn(),removePlayedOverride:mocks.restore}))
vi.mock('@/utils/logger',()=>({logger:{error:vi.fn()}}))
vi.mock('@/utils/toast',()=>({showToast:{success:vi.fn(),error:vi.fn()}}))
vi.mock('@/components/ui/single-date-popover',()=>({SingleDatePopover:()=>null}))
vi.mock('@/components/ui/searchable-select',()=>({SearchableSelect:()=>null}))
vi.mock('@/components/patterns/modal',()=>({ConfirmDialog:()=>null}))
import { CustomerPlayedManager } from './CustomerPlayedManager'
let root:Root,host:HTMLDivElement
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.resetAllMocks();mocks.reservations.mockResolvedValue([{scenario_master_id:'s',title:'予約作品',requested_datetime:'2020-01-01',status:'confirmed'}]);mocks.options.mockResolvedValue([]);host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
async function render(permission:unknown){mocks.snapshot.mockResolvedValue({can_edit:permission,manual:[],overrides:[]});await act(async()=>root.render(<CustomerPlayedManager customerId="customer"/>))}
it('閲覧専用でも履歴は表示し編集ボタンを出さない',async()=>{await render(false);expect(host.textContent).toContain('予約作品');expect(host.textContent).not.toContain('未体験に戻す');expect(Array.from(host.querySelectorAll('button')).some(b=>b.textContent?.includes('追加'))).toBe(false)})
it('変更可能な顧客では操作を維持する',async()=>{await render(true);expect(host.textContent).toContain('未体験に戻す');expect(Array.from(host.querySelectorAll('button')).some(b=>b.textContent?.includes('追加'))).toBe(true)})
it('権限情報欠落時も編集を許可しない',async()=>{await render(undefined);expect(host.textContent).not.toContain('未体験に戻す')})

it('完了済みの過去予約を表示し、取消・未確定・未来の予約を体験済みにしない',async()=>{
 mocks.reservations.mockResolvedValue([
  {scenario_master_id:'done',title:'完了作品',requested_datetime:'2020-01-01',status:'completed'},
  {scenario_master_id:'cancel',title:'取消作品',requested_datetime:'2020-01-01',status:'cancelled'},
  {scenario_master_id:'pending',title:'未確定作品',requested_datetime:'2020-01-01',status:'pending'},
  {scenario_master_id:'future',title:'未来作品',requested_datetime:'2999-01-01',status:'confirmed'},
 ])
 await render(false)
 expect(host.textContent).toContain('完了作品')
 for(const title of ['取消作品','未確定作品','未来作品']) expect(host.textContent).not.toContain(title)
})

it('未体験指定を予約・手動の両方へ表示し、履歴の根拠は残す',async()=>{
 mocks.snapshot.mockResolvedValue({can_edit:false,manual:[{id:'manual',scenario_master_id:'s',scenario_title:'手動作品',played_at:null}],overrides:[{scenario_master_id:'s'}]})
 await act(async()=>root.render(<CustomerPlayedManager customerId="customer"/>))
 expect(host.textContent).toContain('予約作品')
 expect(host.textContent).toContain('手動作品')
 expect(Array.from(host.querySelectorAll('.line-through')).map(e=>e.textContent)).toEqual(['予約作品','手動作品'])
})

it('手動履歴だけの未体験指定を、履歴を削除せず解除できる',async()=>{
 mocks.reservations.mockResolvedValue([])
 mocks.restore.mockResolvedValue(true)
 mocks.snapshot.mockResolvedValue({can_edit:true,manual:[{id:'manual',scenario_master_id:'s',scenario_title:'手動作品',played_at:null}],overrides:[{scenario_master_id:'s'}]})
 await act(async()=>root.render(<CustomerPlayedManager customerId="customer"/>))
 const restore=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('体験済みに戻す'))!
 expect(restore).toBeDefined()
 await act(async()=>restore.click())
 expect(mocks.restore).toHaveBeenCalledWith('customer','s')
 expect(host.textContent).toContain('手動作品')
 expect(host.querySelectorAll('.line-through')).toHaveLength(0)
})
