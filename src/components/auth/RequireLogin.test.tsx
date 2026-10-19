// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RequireLogin } from './RequireLogin'

const authState: { user: { id: string } | null; isInitialized: boolean } = { user: null, isInitialized: false }
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

function LoginProbe() {
  const location = useLocation()
  return <div>ログイン画面 {location.search}</div>
}


let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(node: ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(node) })
}

function unmount() {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
}

function text(): string {
  return host?.textContent ?? ''
}

function renderMyPage(path = '/mypage') {
  mount(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="*" element={<RequireLogin><div>マイページ本体</div></RequireLogin>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireLogin', () => {
  afterEach(() => unmount())
  beforeEach(() => {
    authState.user = null
    authState.isInitialized = false
  })

  it('ログイン状態の確認中は「読み込み中」を出し、中身（ゲスト表示）を描かない', () => {
    renderMyPage()
    expect(text()).toContain('読み込み中...')
    expect(text()).not.toContain('マイページ本体')
  })

  it('未ログイン確定の /mypage はログイン画面へ送り、戻り先 /mypage を残す', () => {
    authState.isInitialized = true
    renderMyPage()
    expect(text()).toContain(`ログイン画面 ?redirect=${encodeURIComponent('/mypage')}`)
    expect(text()).not.toContain('マイページ本体')
  })

  it('タブ付きの URL も戻り先にそのまま載せる', () => {
    authState.isInitialized = true
    renderMyPage('/mypage?tab=coupons')
    expect(text()).toContain(`ログイン画面 ?redirect=${encodeURIComponent('/mypage?tab=coupons')}`)
  })

  it('ログイン済みなら中身を表示する', () => {
    authState.user = { id: 'u1' }
    authState.isInitialized = true
    renderMyPage()
    expect(text()).toContain('マイページ本体')
  })
})
