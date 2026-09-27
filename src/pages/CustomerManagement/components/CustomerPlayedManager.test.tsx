// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),reservations:vi.fn(),options:vi.fn()}))
vi.mock('@/lib/customerPlayHistory',()=>({customerPlayHistory:{snapshot:mocks.snapshot}}))
vi.mock('@/lib/api/customerApi',()=>({customerApi:{reservationHistory:mocks.reservations,playedScenarioOptions:mocks.options}}))
vi.mock('@/lib/playedOverrides',()=>({addPlayedOverride:vi.fn(),removePlayedOverride:vi.fn()}))
vi.mock('@/utils/logger',()=>({logger:{error:vi.fn()}}))
vi.mock('@/utils/toast',()=>({showToast:vi.fn()}))
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
