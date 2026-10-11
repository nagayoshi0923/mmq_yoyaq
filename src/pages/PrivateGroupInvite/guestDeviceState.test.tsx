// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/guestPinReset', () => ({ requestGuestPinReset: vi.fn() }))

import { clearGuestDeviceStorage, guestSessionStorageKey, useGuestDeviceState } from './guestDeviceState'
import { GuestJoinPanel } from './components/GuestJoinPanel'
import { getPrivateGroupGuestToken, hasGuestJoined, markGuestJoined, savePrivateGroupGuestToken, guestStorage } from '@/lib/privateGroupGuestSession'
import { loadNextGroupSource, saveNextGroupSource } from '@/lib/nextPrivateGroup'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear(); sessionStorage.clear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const noop = () => {}

let state: ReturnType<typeof useGuestDeviceState>
function Harness() {
  state = useGuestDeviceState()
  return (
    <GuestJoinPanel mode="new" code="CODE" guestName={state.guestName} guestEmail={state.guestEmail}
      setGuestName={state.setGuestName} setGuestEmail={state.setGuestEmail}
      pinEmail={state.pinEmail} pinCode={state.pinCode} pinError={state.pinError}
      setPinEmail={state.setPinEmail} setPinCode={state.setPinCode} actionLoading={false} isGroupFull={false}
      inviteMemberCap={6} onSubmit={noop} onPinAuth={noop} onOpenPin={noop} onClosePin={noop} onLogin={noop} onSignup={noop} />
  )
}

it('退出（reset）後は再参加欄が空で開き、前の人の回答・PIN 入力を再利用しない（公開前検証 P2）', async () => {
  await act(async () => root.render(<Harness />))
  await act(async () => {
    state.setGuestName('前の人')
    state.setGuestEmail('before@example.invalid')
    state.setResponses({ c1: 'ok', c2: 'ng' })
    state.setPinEmail('before@example.invalid')
    state.setPinCode('1234')
    state.setPinError('認証に失敗しました')
    state.setGeneratedPin('5678')
    state.setJoinedAsNewMember(true)
  })
  expect(host.querySelector<HTMLInputElement>('#guest-name')!.value).toBe('前の人')

  await act(async () => state.reset())

  expect(host.querySelector<HTMLInputElement>('#guest-name')!.value).toBe('')
  expect(host.querySelector<HTMLInputElement>('#guest-email')!.value).toBe('')
  expect(state.responses).toEqual({})
  expect(state.pinEmail).toBe('')
  expect(state.pinCode).toBe('')
  expect(state.pinError).toBeNull()
  expect(state.generatedPin).toBeNull()
  expect(state.joinedAsNewMember).toBe(false)
  expect(state.guestPhone).toBe('')
})

it('退出時に端末の保存から名前・メール・本人確認の印・次の貸切の記憶を消す（参加した印は残す）', () => {
  guestStorage.setItem(guestSessionStorageKey('CODE'), JSON.stringify({ memberId: 'm1', guestName: '前の人', guestEmail: 'before@example.invalid' }))
  sessionStorage.setItem(guestSessionStorageKey('CODE'), 'legacy')
  savePrivateGroupGuestToken('g1', 'token-1')
  markGuestJoined('CODE')
  saveNextGroupSource({ groupId: 'g1', memberId: 'm1', organizationId: 'o1', title: 't', memberCount: 2 })

  clearGuestDeviceStorage('CODE', 'g1')

  expect(localStorage.getItem(guestSessionStorageKey('CODE'))).toBeNull()
  expect(sessionStorage.getItem(guestSessionStorageKey('CODE'))).toBeNull()
  expect(getPrivateGroupGuestToken('g1')).toBeNull()
  expect(loadNextGroupSource()).toBeNull()
  const leftovers = [...Object.keys(localStorage), ...Object.keys(sessionStorage)].map(k => `${k}=${localStorage.getItem(k) ?? sessionStorage.getItem(k)}`).join('\n')
  expect(leftovers).not.toContain('before@example.invalid')
  expect(leftovers).not.toContain('前の人')
  expect(leftovers).not.toContain('token-1')
  // 名前もメールも含まない「参加した印」は、次に「PIN で入る」を出すために残す（点検 57）
  expect(hasGuestJoined('CODE')).toBe(true)
})

it('別のグループの「次の貸切」の記憶は消さない', () => {
  saveNextGroupSource({ groupId: 'other', memberId: 'm9', organizationId: 'o1', title: 't', memberCount: 2 })
  clearGuestDeviceStorage('CODE', 'g1')
  expect(loadNextGroupSource()?.groupId).toBe('other')
})
