// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GuestJoinPanel, type GuestJoinMode } from './GuestJoinPanel'

vi.mock('@/lib/guestPinReset', () => ({ requestGuestPinReset: vi.fn() }))

let root: Root
let host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const noop = () => {}

const render = (mode: GuestJoinMode, onOpenPin = noop) => act(async () => root.render(
  <GuestJoinPanel mode={mode} code="CODE" guestName="" guestEmail="" setGuestName={noop} setGuestEmail={noop}
    pinEmail="" pinCode="" pinError={null} setPinEmail={noop} setPinCode={noop} actionLoading={false} isGroupFull={false}
    inviteMemberCap={6} onSubmit={noop} onPinAuth={noop} onOpenPin={onOpenPin} onClosePin={noop} onLogin={noop} onSignup={noop} />,
))

it('はじめて: お名前とメールアドレスで参加が一番上、会員のログイン・新規登録は下に小さく（#52・#56）', async () => {
  await render('new')
  const text = host.textContent ?? ''
  expect(text.indexOf('お名前とメールアドレスで参加できます')).toBeLessThan(text.indexOf('ログイン'))
  // 点検 F06: 案内は「名前だけ」と言わない（メールアドレスは必須の欄）
  expect(text).not.toContain('名前だけ')
  expect(text).toContain('ほかのメンバーに表示されます（ニックネームでも可）')
  const name = host.querySelector<HTMLInputElement>('#guest-name')
  expect(host.querySelector('label[for="guest-name"]')?.textContent).toContain('お名前')
  expect(name?.placeholder).toBe('例: たろう')
  expect(host.querySelector('[data-testid="guest-join-submit"]')?.textContent).toBe('参加する')
  expect(host.querySelector('[data-testid="guest-open-pin"]')?.textContent).toContain('すでに参加した方は PIN で入る')
})

it('再訪: PIN で入るを大きく、新規参加は畳む（#53）', async () => {
  const onOpenPin = vi.fn()
  await render('returning', onOpenPin)
  expect(host.querySelector('[data-testid="guest-new-form"]')).toBeNull()
  const open = host.querySelector<HTMLButtonElement>('[data-testid="guest-open-pin"]')
  expect(open?.textContent).toBe('PIN で入る')
  await act(async () => open?.click())
  expect(onOpenPin).toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="guest-toggle-new"]')?.click())
  expect(host.querySelector('[data-testid="guest-new-form"]')).not.toBeNull()
})

it('PIN の画面: 新規参加の「参加する」を出さず、例の文字は「例:」付き（#54）', async () => {
  await render('pin')
  expect(host.querySelector('[data-testid="guest-join-submit"]')).toBeNull()
  expect([...host.querySelectorAll('button')].some(b => b.textContent === '参加する')).toBe(false)
  expect(host.querySelector<HTMLInputElement>('#pin-code')?.placeholder).toBe('例: 1234')
  expect(host.querySelector('label[for="pin-code"]')?.textContent).toContain('4 桁')
})
