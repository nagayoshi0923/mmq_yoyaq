// @vitest-environment jsdom
// ヘッダーの「MMQ > 組織名」: 別組織（札幌店）の公開ページでは、ログイン中のスタッフでも URL の組織を出す（2026-10-25 報告）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Organization } from '@/types'

const QW = { id: 'a0000000-0000-0000-0000-000000000001', slug: 'queens-waltz', name: 'クインズワルツ' } as Organization
const SAPPORO = { id: 'c27a9db1-6eb1-421a-8017-94459aa55bac', slug: 'queenswaltz-sapporo', name: 'クインズワルツ札幌店' } as Organization

const state = vi.hoisted(() => ({ user: null as null | { role: string; name: string }, staffOrg: null as null | object, delays: {} as Record<string, number>, calls: [] as string[] }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, signOut: vi.fn() }) }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: state.staffOrg, organizationId: (state.staffOrg as Organization | null)?.id ?? null }), checkIsLicenseAdmin: () => false }))
vi.mock('@/hooks/useOrgThemePreset', () => ({ useOrgThemePreset: () => ({ primary: '#111111' }) }))
vi.mock('./NotificationDropdown', () => ({ NotificationDropdown: () => null }))
vi.mock('@/lib/organization', () => ({
  getOrganizationBySlug: async (slug: string) => {
    state.calls.push(slug)
    const org = [QW, SAPPORO].find((o) => o.slug === slug || o.id === slug) ?? null
    const ms = state.delays[slug] ?? 0
    if (ms) await new Promise((r) => setTimeout(r, ms))
    return org
  },
}))
import { Header, getOrgSlugFromPath, pickHeaderOrganization } from './Header'

let nav: (to: string) => void = () => {}
let currentPath = ''
function Probe() { nav = useNavigate(); currentPath = useLocation().pathname; return null }

let host: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); localStorage.clear(); state.calls = []; state.delays = {}; state.user = null; state.staffOrg = null })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

const flush = async (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const orgButton = () => host.querySelector<HTMLButtonElement>('button[title$="の予約サイトへ"]')
async function renderAt(path: string) {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Probe /><Header /></MemoryRouter>))
  await flush()
}

describe('ヘッダーの組織名とリンク', () => {
  it('ログイン中のクインズワルツのスタッフが札幌店の作品詳細を開くと「クインズワルツ札幌店」を出し、押すと札幌店のトップへ', async () => {
    state.user = { role: 'admin', name: '架空スタッフ' }; state.staffOrg = QW
    await renderAt('/queenswaltz-sapporo/scenario/kaku-sakuhin')
    expect(orgButton()?.textContent).toBe('クインズワルツ札幌店')
    await act(async () => orgButton()!.click())
    expect(currentPath).toBe('/queenswaltz-sapporo')
  })

  it('未ログインでも札幌店の作品詳細は「クインズワルツ札幌店」', async () => {
    await renderAt('/queenswaltz-sapporo/scenario/kaku-sakuhin')
    expect(orgButton()?.textContent).toBe('クインズワルツ札幌店')
  })

  it('札幌 → 東京 → 札幌の移動で毎回その組織を出す（スタッフ）', async () => {
    state.user = { role: 'staff', name: '架空スタッフ' }; state.staffOrg = QW
    await renderAt('/queenswaltz-sapporo/scenario/a')
    expect(orgButton()?.textContent).toBe('クインズワルツ札幌店')
    await act(async () => nav('/queens-waltz/scenario/b')); await flush()
    expect(orgButton()?.textContent).toBe('クインズワルツ')
    await act(async () => nav('/queenswaltz-sapporo/scenario/c')); await flush()
    expect(orgButton()?.textContent).toBe('クインズワルツ札幌店')
  })

  it('前のページの応答が遅れて届いても、今のページの組織を上書きしない', async () => {
    state.delays = { 'queens-waltz': 50 }
    await renderAt('/queens-waltz/scenario/b')
    await act(async () => nav('/queenswaltz-sapporo/scenario/c'))
    await flush(80)
    expect(orgButton()?.textContent).toBe('クインズワルツ札幌店')
  })

  it('URL の組織を読み込む前は、別の組織（スタッフの所属・前に見た組織）を代わりに出さない', async () => {
    state.user = { role: 'admin', name: '架空スタッフ' }; state.staffOrg = QW
    localStorage.setItem('mmq_visited_organization', JSON.stringify({ slug: 'queens-waltz' }))
    state.delays = { 'queenswaltz-sapporo': 50 }
    await act(async () => root.render(<MemoryRouter initialEntries={['/queenswaltz-sapporo/scenario/a']}><Probe /><Header /></MemoryRouter>))
    expect(orgButton()).toBeNull()
    await flush(80)
    expect(orgButton()?.textContent).toBe('クインズワルツ札幌店')
  })

  it('管理ページなど URL に組織が無いページは、従来どおりスタッフの所属組織', async () => {
    state.user = { role: 'admin', name: '架空スタッフ' }; state.staffOrg = QW
    await renderAt('/mypage')
    expect(orgButton()?.textContent).toBe('クインズワルツ')
  })
})

describe('判定の部品', () => {
  it('パスの先頭の組織 slug', () => {
    expect(getOrgSlugFromPath('/queenswaltz-sapporo/scenario/x')).toBe('queenswaltz-sapporo')
    expect(getOrgSlugFromPath('/mypage')).toBeNull()
    expect(getOrgSlugFromPath('/scenario/x')).toBeNull()
    expect(getOrgSlugFromPath('/coupons')).toBeNull()
    expect(getOrgSlugFromPath('/')).toBeNull()
  })
  it('URL に組織があるときは URL の組織だけ', () => {
    expect(pickHeaderOrganization('queenswaltz-sapporo', SAPPORO, QW)).toBe(SAPPORO)
    expect(pickHeaderOrganization('queenswaltz-sapporo', QW, QW)).toBeNull()
    expect(pickHeaderOrganization(null, null, QW)).toBe(QW)
    expect(pickHeaderOrganization(null, SAPPORO, null)).toBe(SAPPORO)
  })
})
