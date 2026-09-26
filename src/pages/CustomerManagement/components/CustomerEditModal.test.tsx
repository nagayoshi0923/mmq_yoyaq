// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Customer } from '@/types'
const mock = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), success: vi.fn(), error: vi.fn(), onSave: vi.fn(), onClose: vi.fn() }))
vi.mock('@/lib/api/customerApi', () => ({ customerApi: { update: mock.update, create: mock.create } }))
vi.mock('@/lib/apiClient', () => ({ ApiClientError: class extends Error { constructor(public status: number, message: string) { super(message) } } }))
vi.mock('@/utils/toast', () => ({ showToast: { success: mock.success, error: mock.error, warning: vi.fn() } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), log: vi.fn() } }))
import { ApiClientError } from '@/lib/apiClient'
import { CustomerEditModal } from './CustomerEditModal'
let root: Root
let container: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); Object.values(mock).forEach(fn => fn.mockReset()); container=document.createElement('div'); document.body.append(container); root=createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
async function setup(customer: Customer | null = { id: 'fixture', name: 'Fixture', email: '', phone: '', line_id: '' } as Customer) {
 await act(async () => root.render(<CustomerEditModal isOpen customer={customer} onSave={mock.onSave} onClose={mock.onClose} />))
}
async function save() {
 const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === '保存')!
 await act(async () => button.click())
}
it('keeps the dialog open and shows the API permission error without a success callback', async () => {
 mock.update.mockRejectedValue(new ApiClientError(404, '顧客が見つからないか、編集権限がありません'))
 await setup(); await save()
 expect(mock.error).toHaveBeenCalledWith('顧客が見つからないか、編集権限がありません')
 expect(mock.success).not.toHaveBeenCalled(); expect(mock.onSave).not.toHaveBeenCalled(); expect(mock.onClose).not.toHaveBeenCalled()
})
it('rejects an empty save result', async () => {
 mock.update.mockResolvedValue(null); await setup(); await save()
 expect(mock.error).toHaveBeenCalled(); expect(mock.onSave).not.toHaveBeenCalled()
})
it('reports success only after receiving the saved customer', async () => {
 mock.update.mockResolvedValue({ id: 'fixture' }); await setup(); await save()
 expect(mock.update).toHaveBeenCalledWith('fixture', { name: 'Fixture', email: null, phone: null, line_id: null })
 expect(mock.success).toHaveBeenCalledWith('顧客情報を更新しました'); expect(mock.onSave).toHaveBeenCalledOnce(); expect(mock.onClose).toHaveBeenCalledOnce()
})
it('creates through the API without requiring a staff-row organization hook', async () => {
 mock.create.mockResolvedValue({ id: 'created' }); await setup(null)
 const input = document.querySelector<HTMLInputElement>('#name')!
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Fixture'); input.dispatchEvent(new Event('input', { bubbles: true })) })
 await save()
 expect(mock.create).toHaveBeenCalledWith({ name: 'Fixture', email: null, phone: null, line_id: null }); expect(mock.onSave).toHaveBeenCalledOnce()
})
