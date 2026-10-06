// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ isMaster: vi.fn(), listOrganizations: vi.fn(), switchOrganization: vi.fn() }))
vi.mock('@/lib/api/platformMasterApi', () => ({ platformMasterApi: api }))
import { MasterOrgSwitcher } from './MasterOrgSwitcher'
const orgs = [{ id: 'hq', name: 'クインズワルツ', slug: 'queens-waltz', is_current: true }, { id: 'fc', name: 'クインズワルツ札幌店', slug: 'queenswaltz-sapporo', is_current: false }]
beforeEach(() => { Object.values(api).forEach(f => f.mockReset()); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
async function render(navigateTo = vi.fn()) {
  const host = document.createElement('div'), root = createRoot(host)
  await act(async () => root.render(<MasterOrgSwitcher navigateTo={navigateTo} />))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  return { host, root, navigateTo }
}
it('マスターには組織の一覧を出し、切り替えたら切り替え先のダッシュボードを開く', async () => {
  api.isMaster.mockResolvedValue(true); api.listOrganizations.mockResolvedValue({ data: orgs, error: null }); api.switchOrganization.mockResolvedValue({ data: 'queenswaltz-sapporo', error: null })
  const { host, root, navigateTo } = await render()
  const select = host.querySelector('select')!
  expect(select.value).toBe('hq'); expect(host.textContent).toContain('クインズワルツ札幌店')
  await act(async () => { select.value = 'fc'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(api.switchOrganization).toHaveBeenCalledWith('fc')
  expect(navigateTo).toHaveBeenCalledWith('/queenswaltz-sapporo/dashboard')
  await act(async () => root.unmount())
})
it('マスター以外には何も出さず、一覧も取りに行かない', async () => {
  api.isMaster.mockResolvedValue(false)
  const { host, root } = await render()
  expect(host.textContent).toBe(''); expect(api.listOrganizations).not.toHaveBeenCalled()
  await act(async () => root.unmount())
})
it('切り替えに失敗したら移動せずに知らせる', async () => {
  api.isMaster.mockResolvedValue(true); api.listOrganizations.mockResolvedValue({ data: orgs, error: null }); api.switchOrganization.mockResolvedValue({ data: null, error: { message: 'x' } })
  const { host, root, navigateTo } = await render()
  const select = host.querySelector('select')!
  await act(async () => { select.value = 'fc'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(navigateTo).not.toHaveBeenCalled(); expect(host.textContent).toContain('切り替えられませんでした')
  await act(async () => root.unmount())
})
