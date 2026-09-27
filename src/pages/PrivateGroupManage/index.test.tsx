// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), snapshot: vi.fn(), pathname: '/group/manage/group-id' }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate, useLocation: () => ({ pathname: mocks.pathname }) }))
vi.mock('@/hooks/usePrivateGroupData', () => ({ usePrivateGroupData: mocks.snapshot }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
import { PrivateGroupManage } from './index'
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname = '/group/manage/group-id'
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
it('keeps old group links working through the unified invite page without mounting legacy actions', async () => {
  mocks.snapshot.mockReturnValue({ group: { invite_code: 'ABC123' }, loading: false, error: null })
  await act(async () => root.render(<PrivateGroupManage />))
  expect(mocks.snapshot).toHaveBeenCalledWith('group-id')
  expect(mocks.navigate).toHaveBeenCalledWith('/group/invite/ABC123', { replace: true })
  expect(container.textContent).not.toContain('招待履歴')
  expect(container.textContent).not.toContain('グループをキャンセル')
})
it('does not navigate using a stale group while loading or when access fails', async () => {
  mocks.snapshot.mockReturnValue({ group: { invite_code: 'OLD' }, loading: true, error: null })
  await act(async () => root.render(<PrivateGroupManage />))
  expect(mocks.navigate).not.toHaveBeenCalled()
  mocks.snapshot.mockReturnValue({ group: { invite_code: 'OLD' }, loading: false, error: 'アクセス権がありません' })
  await act(async () => root.render(<PrivateGroupManage />))
  expect(mocks.navigate).not.toHaveBeenCalled()
  expect(container.textContent).toContain('アクセス権がありません')
})
it('offers recovery for a missing group instead of leaving a permanent loading screen', async () => {
  mocks.snapshot.mockReturnValue({ group: null, loading: false, error: null })
  await act(async () => root.render(<PrivateGroupManage />))
  expect(container.textContent).toContain('グループが見つかりません')
  await act(async () => container.querySelector('button')!.click())
  expect(mocks.navigate).toHaveBeenCalledWith('/')
})
