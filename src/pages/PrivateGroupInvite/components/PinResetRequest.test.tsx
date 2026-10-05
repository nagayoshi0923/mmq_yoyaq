// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))
import { PinResetRequest } from './PinResetRequest'
beforeEach(() => { invoke.mockReset(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
async function click(email: string) {
  const host = document.createElement('div'), root = createRoot(host)
  await act(async () => root.render(<PinResetRequest inviteCode="CODE1" email={email} />))
  await act(async () => { host.querySelector('button')!.click() })
  return { host, root }
}
it('入力中のアドレスと招待コードで再発行を頼み、登録の有無が分からない同じ案内を出す', async () => {
  invoke.mockResolvedValue({ data: { success: true, message: 'ご登録があれば、新しいPINをメールでお送りしました。' }, error: null })
  const { host, root } = await click(' guest@example.invalid ')
  expect(invoke).toHaveBeenCalledWith('request-guest-pin-reset', { body: { inviteCode: 'CODE1', email: 'guest@example.invalid' } })
  expect(host.textContent).toContain('ご登録があれば')
  await act(async () => root.unmount())
})
it('アドレスが未入力なら送らずに案内する', async () => {
  const { host, root } = await click('')
  expect(invoke).not.toHaveBeenCalled()
  expect(host.textContent).toContain('メールアドレスを入力してから')
  await act(async () => root.unmount())
})
it('送れなかったときは時間をおくよう案内する', async () => {
  invoke.mockResolvedValue({ data: null, error: new Error('503') })
  const { host, root } = await click('guest@example.invalid')
  expect(host.textContent).toContain('時間をおいて')
  await act(async () => root.unmount())
})
