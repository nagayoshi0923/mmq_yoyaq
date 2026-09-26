// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useSettingsStore } from './useSettingsStore'
import { storeApi } from '@/lib/api/storeApi'
import { resolveSettingsStore } from '@/components/settings/settingsCatalog'
const context = vi.hoisted(() => ({ organizationId: 'org-a' }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => context }))
vi.mock('@/lib/api/storeApi', () => ({ storeApi: { getAll: vi.fn() } }))
let root: Root
let result: ReturnType<typeof useSettingsStore>
let navigate: NavigateFunction
function Harness() { result = useSettingsStore(); navigate = useNavigate(); return null }
const render = () => act(async () => { root.render(<MemoryRouter initialEntries={['/settings?tab=email&store=b']}><Harness /></MemoryRouter>) })
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  context.organizationId = 'org-a'
  vi.mocked(storeApi.getAll).mockResolvedValue([{ id: 'a', name: '店舗A' }, { id: 'b', name: '店舗B' }] as never)
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); vi.clearAllMocks() })
it('店舗からのリンクとURLの戻る操作で同じ店舗を選択する', async () => {
  await render()
  expect(result.selectedStoreId).toBe('b')
  await act(async () => result.handleStoreChange('a'))
  expect(result.selectedStoreId).toBe('a')
  await act(async () => navigate(-1))
  expect(result.selectedStoreId).toBe('b')
})
it('別組織・削除済みの店舗IDを先頭店舗に置き換えない', async () => {
  await render()
  await act(async () => navigate('/settings?tab=email&store=other-organization'))
  expect(result.selectedStoreId).toBe('')
})
it('組織切替後は以前の店舗一覧を編集対象として使わない', async () => {
  await render()
  context.organizationId = 'org-b'
  vi.mocked(storeApi.getAll).mockReturnValue(new Promise(() => {}))
  await render()
  expect(result.loading).toBe(true)
  expect(result.stores).toEqual([])
  expect(result.selectedStoreId).toBe('')
})
it('全店舗一括は対応ページだけで使用し、通常ページは実店舗を選ぶ', () => {
  const stores = [{ id: 'a' }]
  expect(resolveSettingsStore(stores, 'all', true)).toBe('all')
  expect(resolveSettingsStore(stores, 'all', false)).toBe('a')
  expect(resolveSettingsStore([], null, false)).toBe('')
})
